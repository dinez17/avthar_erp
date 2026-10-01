import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type {
  AuthenticatedUser,
  InvoiceableLine,
  OrderSplitPlan,
  Paginated,
  SalesInvoiceItem,
  SalesInvoicePrintData,
  SalesReturnItem,
  SplitInvoiceResult,
} from '@tiles-erp/shared-types';
import type { PricingRights } from '../application/price-guard';
import { SALES_INVOICE_REPOSITORY, type SalesInvoiceRepository } from '../domain/sales-invoice.repository';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../domain/sales-order.repository';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  CancelSalesInvoiceCommand,
  CreateSalesReturnCommand,
  CreateSalesInvoiceCommand,
  DeleteSalesInvoiceCommand,
  GetSalesInvoiceQuery,
  InvoiceableLinesQuery,
  ListSalesInvoicesQuery,
  OrderSplitPlanQuery,
  PostSalesInvoiceCommand,
  PrintDeliverySlipCommand,
  SplitSalesOrderCommand,
  SalesInvoicePrintQuery,
  UpdateSalesInvoiceCommand,
} from '../application/sales-invoice.handlers';
import {
  CancelSalesInvoiceDto,
  CreateSalesReturnDto,
  CreateSalesInvoiceDto,
  InvoiceVersionDto,
  SalesInvoiceListQueryDto,
  SalesReturnListQueryDto,
  RefundSalesReturnDto,
  SplitInvoiceDto,
  UpdateSalesInvoiceDto,
} from './dto/sales-invoice.dto';

/** Only an approver may post an invoice that breaches the customer's credit limit. */
/**
 * What this user may override while pricing.
 *
 * Two separate rights: a branch minimum can itself be set below cost, so permission to
 * ignore the minimum must not quietly include permission to lose money.
 */
const pricingRights = (user: AuthenticatedUser): PricingRights => ({
  canOverridePrice:
    user.roles.includes('SUPER_ADMIN') ||
    user.permissions.includes(PERMISSIONS.QUOTATION_OVERRIDE_PRICE),
  canSellBelowCost:
    user.roles.includes('SUPER_ADMIN') ||
    user.permissions.includes(PERMISSIONS.SELL_BELOW_COST),
  canOverrideCredit:
    user.roles.includes('SUPER_ADMIN') ||
    user.permissions.includes(PERMISSIONS.CUSTOMER_CREDIT_APPROVE),
});

const canOverrideCredit = (user: AuthenticatedUser): boolean =>
  user.roles.includes('SUPER_ADMIN') ||
  user.permissions.includes(PERMISSIONS.CUSTOMER_CREDIT_APPROVE);

interface DeliverySlipListItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  branchName: string;
}

@ApiTags('Sales invoices')
@ApiBearerAuth()
@Controller('sales-invoices')
export class SalesInvoiceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository,
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
  ) {}

  private mayAccessBranch(user: AuthenticatedUser, branchId: string): boolean {
    return user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN') ||
      user.branchIds.includes(branchId);
  }

  @Post('transfer-and-invoice/:salesOrderId')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CREATE)
  @ApiOperation({ summary: 'Transfer reserved stock into the order branch and create its draft invoice' })
  async transferAndInvoice(
    @Param('salesOrderId', ParseUUIDPipe) salesOrderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ invoice: SalesInvoiceItem; transferDocuments: string[] }> {
    const order = await this.orders.findById(salesOrderId);
    if (!order) throw new NotFoundError('Sales order not found');
    const allowed = user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')
      ? null : user.branchIds;
    if (allowed && !allowed.includes(order.branchId)) {
      throw new ValidationError('You are not assigned to this order branch');
    }
    const transferDocuments = await this.invoices.transferOrderStock(salesOrderId, user.id, allowed);
    // If the transfer committed but the response was lost, a retry returns the draft
    // instead of raising another invoice. This also covers a failure between the two steps.
    const drafts = await this.invoices.list({ page: 1, pageSize: 1 }, {
      salesOrderId, status: 'DRAFT', branchId: order.branchId,
    });
    if (drafts.items.length) return { invoice: drafts.items[0], transferDocuments };

    const invoiceable = await this.invoices.invoiceableLines(salesOrderId);
    const lines = invoiceable.flatMap((line) => {
      let remaining = line.pendingQtyBoxes;
      return line.sources.filter((source) => source.branchId === order.branchId).flatMap((source) => {
        const qtyBoxes = Math.round(Math.min(remaining, source.qtyBoxes) * 1000) / 1000;
        remaining = Math.round((remaining - qtyBoxes) * 1000) / 1000;
        return qtyBoxes > 0 ? [{
          productId: line.productId,
          salesOrderLineId: line.salesOrderLineId,
          godownId: source.godownId,
          batchNo: source.batchNo,
          shade: source.shade,
          boxes: line.baseUom === 'PIECE' ? 0 : Math.floor(qtyBoxes),
          pieces: line.baseUom === 'PIECE'
            ? Math.round(qtyBoxes * line.piecesPerBox)
            : Math.round((qtyBoxes - Math.floor(qtyBoxes)) * line.piecesPerBox),
          qtyBoxes,
          rate: line.rate,
          discountPct: line.discountPct,
          gstRate: line.gstRate,
        }] : [];
      });
    });
    if (lines.length === 0) throw new ValidationError('No pending stock is available to invoice');
    try {
      const invoice: SalesInvoiceItem = await this.commandBus.execute(new CreateSalesInvoiceCommand({
        customerId: order.customerId,
        branchId: order.branchId,
        salesOrderId,
        invoiceDate: new Date().toISOString(),
        freightCharge: order.freightCharge,
        unloadingCharge: order.unloadingCharge,
        loadingCharge: order.loadingCharge,
        roundOff: order.roundOff,
        remarks: order.remarks ?? undefined,
        lines,
      }, user.id, pricingRights(user)));
      return { invoice, transferDocuments };
    } catch (error) {
      if (transferDocuments.length) {
        throw new ValidationError(
          `Stock transfer ${transferDocuments.join(', ')} completed, but the draft invoice failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }. Retry this action; stock will not be transferred twice.`,
        );
      }
      throw error;
    }
  }

  @Get('split-plan/:salesOrderId')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_READ)
  @ApiOperation({ summary: 'How an order breaks down by supplying branch, before invoicing' })
  splitPlan(
    @Param('salesOrderId', ParseUUIDPipe) salesOrderId: string,
  ): Promise<OrderSplitPlan> {
    return this.queryBus.execute(new OrderSplitPlanQuery(salesOrderId));
  }

  @Post('split')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CREATE)
  @ApiOperation({ summary: 'Raise one draft invoice per supplying branch on an order' })
  split(
    @Body() dto: SplitInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SplitInvoiceResult> {
    return this.commandBus.execute(new SplitSalesOrderCommand(dto, user.id, pricingRights(user)));
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List sales invoices, newest first' })
  list(@Query() query: SalesInvoiceListQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<SalesInvoiceItem>> {
    return this.queryBus.execute(
      new ListSalesInvoicesQuery(query, {
        customerId: query.customerId,
        branchId: query.branchId,
        branchIds: user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN') ? undefined : user.branchIds,
        salesOrderId: query.salesOrderId,
        status: query.status,
        fromDate: query.fromDate ? new Date(`${query.fromDate}T00:00:00.000Z`) : undefined,
        toDate: query.toDate ? new Date(`${query.toDate}T23:59:59.999Z`) : undefined,
      }),
    );
  }

  @Get('delivery-slips')
  @RequirePermissions(PERMISSIONS.DELIVERY_SLIP_PRINT)
  @ApiOperation({ summary: 'Posted invoices available for authorised delivery-slip printing' })
  async deliverySlips(
    @Query() query: SalesInvoiceListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<DeliverySlipListItem>> {
    const result = await this.queryBus.execute<ListSalesInvoicesQuery, Paginated<SalesInvoiceItem>>(
      new ListSalesInvoicesQuery(query, {
        branchIds: user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')
          ? undefined
          : user.branchIds,
        status: 'POSTED',
        fromDate: query.fromDate ? new Date(`${query.fromDate}T00:00:00.000Z`) : undefined,
        toDate: query.toDate ? new Date(`${query.toDate}T23:59:59.999Z`) : undefined,
      }),
    );
    return {
      meta: result.meta,
      items: result.items.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        customerName: invoice.customerName,
        branchName: invoice.branchName,
      })),
    };
  }

  @Get('returns')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List posted sales returns, newest first' })
  listReturns(
    @Query() query: SalesReturnListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<SalesReturnItem>> {
    return this.invoices.listReturns(query, {
      customerId: query.customerId,
      branchId: query.branchId,
      branchIds: user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')
        ? undefined
        : user.branchIds,
      fromDate: query.fromDate ? new Date(`${query.fromDate}T00:00:00.000Z`) : undefined,
      toDate: query.toDate ? new Date(`${query.toDate}T23:59:59.999Z`) : undefined,
    });
  }

  @Get('returns/:id')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_READ)
  @ApiOperation({ summary: 'Get a sales return with its returned items' })
  async getReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesReturnItem> {
    const returned = await this.invoices.findReturnById(id);
    if (!returned) throw new NotFoundError('Sales return not found');
    if (
      !user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN') &&
      !user.branchIds.includes(returned.branchId)
    ) {
      throw new NotFoundError('Sales return not found');
    }
    return returned;
  }

  @Get('invoiceable/:salesOrderId')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CREATE)
  @ApiOperation({ summary: 'What is still to be invoiced on an order, with reserved sources' })
  invoiceable(
    @Param('salesOrderId', ParseUUIDPipe) salesOrderId: string,
  ): Promise<InvoiceableLine[]> {
    return this.queryBus.execute(new InvoiceableLinesQuery(salesOrderId));
  }

  @Get(':id/print')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_READ)
  @ApiOperation({ summary: 'Invoice with the letterhead, terms and declaration a print needs' })
  print(@Param('id', ParseUUIDPipe) id: string): Promise<SalesInvoicePrintData> {
    return this.queryBus.execute(new SalesInvoicePrintQuery(id));
  }

  @Get(':id/delivery-slip-preview')
  @RequirePermissions(PERMISSIONS.DELIVERY_SLIP_PRINT)
  @ApiOperation({ summary: 'Preview a delivery slip without consuming its single print' })
  async previewDeliverySlip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesInvoicePrintData> {
    const data = await this.queryBus.execute<SalesInvoicePrintQuery, SalesInvoicePrintData>(
      new SalesInvoicePrintQuery(id),
    );
    if (!this.mayAccessBranch(user, data.invoice.branchId)) throw new NotFoundError('Sales invoice not found');
    return data;
  }

  @Post(':id/delivery-slip-print')
  @RequirePermissions(PERMISSIONS.DELIVERY_SLIP_PRINT)
  @ApiOperation({ summary: 'Issue a delivery slip; every user is limited to one copy' })
  async printDeliverySlip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesInvoicePrintData> {
    const preview = await this.queryBus.execute<SalesInvoicePrintQuery, SalesInvoicePrintData>(
      new SalesInvoicePrintQuery(id),
    );
    if (!this.mayAccessBranch(user, preview.invoice.branchId)) throw new NotFoundError('Sales invoice not found');
    return this.commandBus.execute(new PrintDeliverySlipCommand(id, user.id));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_READ)
  @ApiOperation({ summary: 'Get a sales invoice with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SalesInvoiceItem> {
    return this.queryBus.execute(new GetSalesInvoiceQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Create a draft invoice, optionally against a confirmed order' })
  create(
    @Body() dto: CreateSalesInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesInvoiceItem> {
    return this.commandBus.execute(new CreateSalesInvoiceCommand(dto, user.id, pricingRights(user)));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_UPDATE)
  @ApiOperation({ summary: 'Update a draft invoice' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesInvoiceItem> {
    return this.commandBus.execute(new UpdateSalesInvoiceCommand(id, dto, user.id, pricingRights(user)));
  }

  @Patch(':id/post')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_POST)
  @ApiOperation({ summary: 'Post the invoice: stock out, reservations consumed' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesInvoiceItem> {
    return this.commandBus.execute(
      new PostSalesInvoiceCommand(id, dto.version, user.id, canOverrideCredit(user)),
    );
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CANCEL)
  @ApiOperation({ summary: 'Cancel the invoice and put the stock back' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSalesInvoiceDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SalesInvoiceItem> {
    return this.commandBus.execute(
      new CancelSalesInvoiceCommand(id, dto.version, dto.reason, actorId),
    );
  }

  @Post(':id/returns')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CANCEL)
  @ApiOperation({ summary: 'Return selected quantities against a posted sales invoice' })
  createReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSalesReturnDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SalesReturnItem> {
    return this.commandBus.execute(new CreateSalesReturnCommand(id, dto, actorId));
  }

  @Post('returns/:id/refunds')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CANCEL)
  @ApiOperation({ summary: 'Pay a customer refund against a posted sales return' })
  async refundReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundSalesReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesReturnItem> {
    const returned = await this.invoices.findReturnById(id);
    if (!returned) throw new NotFoundError('Sales return not found');
    if (
      !user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN') &&
      !user.branchIds.includes(returned.branchId)
    ) throw new NotFoundError('Sales return not found');
    return this.invoices.refundReturn(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_DELETE)
  @ApiOperation({ summary: 'Delete a draft invoice' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: true }> {
    return this.commandBus.execute(new DeleteSalesInvoiceCommand(id, actorId));
  }
}
