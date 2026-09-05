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
  OpenBillItem,
  OpenDebitNoteItem,
  Paginated,
  PayableRow,
  SupplierDueSummary,
  SupplierLedger,
  SupplierPaymentItem,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CancelSupplierPaymentCommand,
  CreateSupplierPaymentCommand,
  DeleteSupplierPaymentCommand,
  GetSupplierPaymentQuery,
  ListSupplierPaymentsQuery,
  OpenBillsQuery,
  OpenDebitNotesQuery,
  PayablesQuery,
  PostSupplierPaymentCommand,
  SupplierDueQuery,
  SupplierLedgerQuery,
  UpdateSupplierPaymentCommand,
} from '../application/supplier-payment.handlers';
import {
  CancelSupplierPaymentDto,
  CreateSupplierPaymentDto,
  PayablesQueryDto,
  SupplierLedgerQueryDto,
  SupplierPaymentListQueryDto,
  SupplierScopeQueryDto,
  UpdateSupplierPaymentDto,
  VersionDto,
} from './dto/supplier-payment.dto';

@ApiTags('Supplier payments')
@ApiBearerAuth()
@Controller('supplier-payments')
export class SupplierPaymentController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_READ)
  @ApiOperation({ summary: 'List supplier payments, newest first' })
  list(@Query() query: SupplierPaymentListQueryDto): Promise<Paginated<SupplierPaymentItem>> {
    return this.queryBus.execute(
      new ListSupplierPaymentsQuery(query, {
        supplierId: query.supplierId,
        branchId: query.branchId,
        status: query.status,
      }),
    );
  }

  @Get('open-bills')
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_READ)
  @ApiOperation({ summary: 'Bills still owing, soonest due first' })
  openBills(@Query() query: SupplierScopeQueryDto): Promise<OpenBillItem[]> {
    return this.queryBus.execute(new OpenBillsQuery(query.supplierId, query.branchId));
  }

  @Get('open-debit-notes')
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_READ)
  @ApiOperation({ summary: 'Debit notes with credit left to spend' })
  openDebitNotes(@Query() query: SupplierScopeQueryDto): Promise<OpenDebitNoteItem[]> {
    return this.queryBus.execute(new OpenDebitNotesQuery(query.supplierId, query.branchId));
  }

  @Get('due')
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_READ)
  @ApiOperation({ summary: 'What is owed to one supplier, with credit and advances' })
  due(@Query() query: SupplierScopeQueryDto): Promise<SupplierDueSummary> {
    return this.queryBus.execute(new SupplierDueQuery(query.supplierId, query.branchId));
  }

  @Get('ledger')
  @RequirePermissions(PERMISSIONS.SUPPLIER_LEDGER_READ)
  @ApiOperation({ summary: 'The supplier statement, with a running balance' })
  ledger(@Query() query: SupplierLedgerQueryDto): Promise<SupplierLedger> {
    return this.queryBus.execute(
      new SupplierLedgerQuery(query.supplierId, query.from, query.to),
    );
  }

  @Get('payables')
  @RequirePermissions(PERMISSIONS.SUPPLIER_LEDGER_READ)
  @ApiOperation({ summary: 'Every supplier owed money, aged from the due date' })
  payables(@Query() query: PayablesQueryDto): Promise<PayableRow[]> {
    return this.queryBus.execute(new PayablesQuery(query.branchId));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_READ)
  @ApiOperation({ summary: 'Get a payment with its tenders, set-offs and allocations' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierPaymentItem> {
    return this.queryBus.execute(new GetSupplierPaymentQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_CREATE)
  @ApiOperation({ summary: 'Draft a payment; posting is a separate step' })
  create(
    @Body() dto: CreateSupplierPaymentDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SupplierPaymentItem> {
    return this.commandBus.execute(new CreateSupplierPaymentCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_UPDATE)
  @ApiOperation({ summary: 'Edit a draft payment' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierPaymentDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SupplierPaymentItem> {
    return this.commandBus.execute(new UpdateSupplierPaymentCommand(id, dto, actorId));
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_POST)
  @ApiOperation({ summary: 'Settle the allocated bills and spend the debit notes' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SupplierPaymentItem> {
    return this.commandBus.execute(new PostSupplierPaymentCommand(id, dto.version, actorId));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_CANCEL)
  @ApiOperation({ summary: 'Undo a posted payment, returning the money and the credit' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSupplierPaymentDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SupplierPaymentItem> {
    return this.commandBus.execute(
      new CancelSupplierPaymentCommand(id, dto.version, dto.reason, actorId),
    );
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIER_PAYMENT_DELETE)
  @ApiOperation({ summary: 'Soft-delete a draft payment' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: true }> {
    return this.commandBus.execute(new DeleteSupplierPaymentCommand(id, actorId));
  }
}
