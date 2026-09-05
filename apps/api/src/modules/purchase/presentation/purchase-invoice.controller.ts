import {
  Body,
  Controller,
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
  Paginated,
  PurchaseInvoiceItem,
  SupplierRateItem,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  CreatePurchaseInvoiceCommand,
  GetPurchaseInvoiceQuery,
  ListPurchaseInvoicesQuery,
  PostPurchaseInvoiceCommand,
  SupplierRateHistoryQuery,
  UpdatePurchaseInvoiceCommand,
} from '../application/purchase-invoice.handlers';
import {
  CreatePurchaseInvoiceDto,
  PostInvoiceDto,
  PurchaseInvoiceListQueryDto,
  RateHistoryQueryDto,
  UpdatePurchaseInvoiceDto,
} from './dto/purchase-invoice.dto';

@ApiTags('Purchase invoices')
@ApiBearerAuth()
@Controller('purchase-invoices')
export class PurchaseInvoiceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List purchase invoices, newest first' })
  list(@Query() query: PurchaseInvoiceListQueryDto): Promise<Paginated<PurchaseInvoiceItem>> {
    return this.queryBus.execute(
      new ListPurchaseInvoicesQuery(query, {
        supplierId: query.supplierId,
        branchId: query.branchId,
        status: query.status,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
      }),
    );
  }

  @Get('rate-history')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_READ)
  @ApiOperation({ summary: 'Historical purchase rates by supplier and product' })
  rateHistory(@Query() query: RateHistoryQueryDto): Promise<Paginated<SupplierRateItem>> {
    return this.queryBus.execute(
      new SupplierRateHistoryQuery(query, {
        productId: query.productId,
        supplierId: query.supplierId,
      }),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_READ)
  @ApiOperation({ summary: 'Get an invoice with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseInvoiceItem> {
    return this.queryBus.execute(new GetPurchaseInvoiceQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Enter a draft purchase invoice' })
  create(
    @Body() dto: CreatePurchaseInvoiceDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseInvoiceItem> {
    return this.commandBus.execute(new CreatePurchaseInvoiceCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_CREATE)
  @ApiOperation({ summary: 'Update a draft invoice' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseInvoiceDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseInvoiceItem> {
    return this.commandBus.execute(new UpdatePurchaseInvoiceCommand(id, dto, actorId));
  }

  @Patch(':id/post')
  @RequirePermissions(PERMISSIONS.PURCHASE_INVOICE_POST)
  @ApiOperation({
    summary: 'Post the invoice: records supplier rates and refreshes landing costs',
  })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostInvoiceDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseInvoiceItem> {
    return this.commandBus.execute(new PostPurchaseInvoiceCommand(id, dto.version, actorId));
  }
}
