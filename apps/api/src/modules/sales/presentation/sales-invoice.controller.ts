import {
  Body,
  Controller,
  Delete,
  Get,
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
  SplitInvoiceResult,
} from '@tiles-erp/shared-types';
import type { PricingRights } from '../application/price-guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  CancelSalesInvoiceCommand,
  CreateSalesInvoiceCommand,
  DeleteSalesInvoiceCommand,
  GetSalesInvoiceQuery,
  InvoiceableLinesQuery,
  ListSalesInvoicesQuery,
  OrderSplitPlanQuery,
  PostSalesInvoiceCommand,
  SplitSalesOrderCommand,
  SalesInvoicePrintQuery,
  UpdateSalesInvoiceCommand,
} from '../application/sales-invoice.handlers';
import {
  CancelSalesInvoiceDto,
  CreateSalesInvoiceDto,
  InvoiceVersionDto,
  SalesInvoiceListQueryDto,
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

@ApiTags('Sales invoices')
@ApiBearerAuth()
@Controller('sales-invoices')
export class SalesInvoiceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

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
  list(@Query() query: SalesInvoiceListQueryDto): Promise<Paginated<SalesInvoiceItem>> {
    return this.queryBus.execute(
      new ListSalesInvoicesQuery(query, {
        customerId: query.customerId,
        branchId: query.branchId,
        salesOrderId: query.salesOrderId,
        status: query.status,
      }),
    );
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
