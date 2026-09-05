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
  CustomerDueSummary,
  CustomerLedger,
  CustomerReceiptItem,
  OpenInvoiceItem,
  OutstandingRow,
  Paginated,
  ReceiptPrintData,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  CancelReceiptCommand,
  CreateReceiptCommand,
  CustomerDueQuery,
  CustomerLedgerQuery,
  DeleteReceiptCommand,
  GetReceiptQuery,
  ListReceiptsQuery,
  OpenInvoicesQuery,
  OutstandingQuery,
  PostReceiptCommand,
  ReceiptPrintQuery,
  UpdateReceiptCommand,
} from '../application/receipt.handlers';
import {
  CancelReceiptDto,
  CreateReceiptDto,
  LedgerQueryDto,
  OpenInvoicesQueryDto,
  OutstandingQueryDto,
  ReceiptListQueryDto,
  ReceiptVersionDto,
  UpdateReceiptDto,
} from './dto/receipt.dto';

@ApiTags('Collections')
@ApiBearerAuth()
@Controller()
export class ReceiptController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('receipts')
  @RequirePermissions(PERMISSIONS.RECEIPT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List customer receipts, newest first' })
  list(@Query() query: ReceiptListQueryDto): Promise<Paginated<CustomerReceiptItem>> {
    return this.queryBus.execute(
      new ListReceiptsQuery(query, {
        customerId: query.customerId,
        branchId: query.branchId,
        status: query.status,
      }),
    );
  }

  @Get('receipts/open-invoices')
  @RequirePermissions(PERMISSIONS.RECEIPT_CREATE)
  @ApiOperation({ summary: "A customer's unpaid invoices, oldest first" })
  openInvoices(@Query() query: OpenInvoicesQueryDto): Promise<OpenInvoiceItem[]> {
    return this.queryBus.execute(new OpenInvoicesQuery(query.customerId, query.branchId));
  }

  @Get('receipts/customer-due')
  @RequirePermissions(PERMISSIONS.RECEIPT_CREATE)
  @ApiOperation({ summary: "A customer's total outstanding before money is entered" })
  customerDue(@Query() query: OpenInvoicesQueryDto): Promise<CustomerDueSummary> {
    return this.queryBus.execute(new CustomerDueQuery(query.customerId, query.branchId));
  }

  @Get('receipts/:id/print')
  @RequirePermissions(PERMISSIONS.RECEIPT_READ)
  @ApiOperation({ summary: 'Receipt with the letterhead a printed copy needs' })
  print(@Param('id', ParseUUIDPipe) id: string): Promise<ReceiptPrintData> {
    return this.queryBus.execute(new ReceiptPrintQuery(id));
  }

  @Get('receipts/:id')
  @RequirePermissions(PERMISSIONS.RECEIPT_READ)
  @ApiOperation({ summary: 'Get a receipt with its allocations' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerReceiptItem> {
    return this.queryBus.execute(new GetReceiptQuery(id));
  }

  @Post('receipts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.RECEIPT_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Record a receipt; allocations default to the oldest invoices' })
  create(
    @Body() dto: CreateReceiptDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CustomerReceiptItem> {
    return this.commandBus.execute(new CreateReceiptCommand(dto, actorId));
  }

  @Patch('receipts/:id')
  @RequirePermissions(PERMISSIONS.RECEIPT_UPDATE)
  @ApiOperation({ summary: 'Update a draft receipt' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReceiptDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CustomerReceiptItem> {
    return this.commandBus.execute(new UpdateReceiptCommand(id, dto, actorId));
  }

  @Patch('receipts/:id/post')
  @RequirePermissions(PERMISSIONS.RECEIPT_POST)
  @ApiOperation({ summary: 'Post the receipt: the allocated invoices are settled' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiptVersionDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CustomerReceiptItem> {
    return this.commandBus.execute(new PostReceiptCommand(id, dto.version, actorId));
  }

  @Patch('receipts/:id/cancel')
  @RequirePermissions(PERMISSIONS.RECEIPT_CANCEL)
  @ApiOperation({ summary: 'Cancel the receipt and un-settle its invoices' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelReceiptDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CustomerReceiptItem> {
    return this.commandBus.execute(new CancelReceiptCommand(id, dto.version, dto.reason, actorId));
  }

  @Delete('receipts/:id')
  @RequirePermissions(PERMISSIONS.RECEIPT_DELETE)
  @ApiOperation({ summary: 'Delete a draft receipt' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: true }> {
    return this.commandBus.execute(new DeleteReceiptCommand(id, actorId));
  }

  /*
   * These live under `receivables`, not `customers`. The parties module owns
   * `@Controller('customers')` with a `:id` route, and it is registered first — so
   * `/customers/outstanding` was being read as a customer id and rejected.
   */
  @Get('receivables/outstanding')
  @RequirePermissions(PERMISSIONS.CUSTOMER_LEDGER_READ)
  @ApiOperation({ summary: 'Outstanding balances by customer, aged into buckets' })
  outstanding(@Query() query: OutstandingQueryDto): Promise<OutstandingRow[]> {
    return this.queryBus.execute(new OutstandingQuery(query.branchId));
  }

  @Get('receivables/:id/ledger')
  @RequirePermissions(PERMISSIONS.CUSTOMER_LEDGER_READ)
  @ApiOperation({ summary: 'Customer statement: invoices, receipts and running balance' })
  ledger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LedgerQueryDto,
  ): Promise<CustomerLedger> {
    return this.queryBus.execute(new CustomerLedgerQuery(id, query.from, query.to));
  }
}
