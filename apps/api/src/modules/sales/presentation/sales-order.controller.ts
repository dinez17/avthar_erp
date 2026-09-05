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
  AvailableStockItem,
  Paginated,
  SalesOrderItem,
  StockReservationItem,
} from '@tiles-erp/shared-types';
import type { PricingRights } from '../application/price-guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  AvailableStockQuery,
  SellableBranchesQuery,
  CancelSalesOrderCommand,
  ConfirmSalesOrderCommand,
  ConvertQuotationCommand,
  CreateSalesOrderCommand,
  DeleteSalesOrderCommand,
  GetSalesOrderQuery,
  ListSalesOrdersQuery,
  SalesOrderReservationsQuery,
  UpdateSalesOrderCommand,
} from '../application/sales-order.handlers';
import {
  AvailableStockQueryDto,
  CancelSalesOrderDto,
  ConvertQuotationDto,
  CreateSalesOrderDto,
  SalesOrderListQueryDto,
  UpdateSalesOrderDto,
  ConfirmSalesOrderDto,
} from './dto/sales-order.dto';

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

/** Only an approver may commit an order that breaches the customer's credit limit. */
const canOverrideCredit = (user: AuthenticatedUser): boolean =>
  user.roles.includes('SUPER_ADMIN') ||
  user.permissions.includes(PERMISSIONS.CUSTOMER_CREDIT_APPROVE);

@ApiTags('Sales orders')
@ApiBearerAuth()
@Controller('sales-orders')
export class SalesOrderController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_ORDER_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List sales orders, newest first' })
  list(@Query() query: SalesOrderListQueryDto): Promise<Paginated<SalesOrderItem>> {
    return this.queryBus.execute(
      new ListSalesOrdersQuery(query, {
        customerId: query.customerId,
        branchId: query.branchId,
        status: query.status,
      }),
    );
  }

  @Get('available-stock')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_READ)
  @ApiOperation({ summary: 'Free stock per godown: on hand less active reservations' })
  async availableStock(@Query() query: AvailableStockQueryDto): Promise<AvailableStockItem[]> {
    const ids = query.productIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const branchIds = query.crossBranch
      ? await this.queryBus.execute<SellableBranchesQuery, string[]>(new SellableBranchesQuery())
      : [query.branchId];
    return this.queryBus.execute(new AvailableStockQuery(branchIds, ids));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_READ)
  @ApiOperation({ summary: 'Get a sales order with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderItem> {
    return this.queryBus.execute(new GetSalesOrderQuery(id));
  }

  @Get(':id/reservations')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_READ)
  @ApiOperation({ summary: 'Stock reserved for this order, by godown and batch' })
  reservations(@Param('id', ParseUUIDPipe) id: string): Promise<StockReservationItem[]> {
    return this.queryBus.execute(new SalesOrderReservationsQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_ORDER_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Create a draft sales order' })
  create(
    @Body() dto: CreateSalesOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesOrderItem> {
    return this.commandBus.execute(
      new CreateSalesOrderCommand(dto, user.id, pricingRights(user)),
    );
  }

  @Post('from-quotation/:quotationId')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_ORDER_CREATE)
  @ApiOperation({ summary: 'Convert an accepted quotation into a draft order' })
  convert(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: ConvertQuotationDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SalesOrderItem> {
    return this.commandBus.execute(
      new ConvertQuotationCommand(quotationId, actorId, dto.deliveryDate, dto.customerId),
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_UPDATE)
  @ApiOperation({ summary: 'Update a draft sales order' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesOrderItem> {
    return this.commandBus.execute(
      new UpdateSalesOrderCommand(id, dto, user.id, pricingRights(user)),
    );
  }

  @Patch(':id/confirm')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_CONFIRM)
  @ApiOperation({ summary: 'Confirm the order and reserve stock for it' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmSalesOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SalesOrderItem> {
    return this.commandBus.execute(
      new ConfirmSalesOrderCommand(
        id,
        dto.version,
        user.id,
        canOverrideCredit(user),
        dto.allowCrossBranch,
      ),
    );
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_CANCEL)
  @ApiOperation({ summary: 'Cancel the order and release its reservations' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSalesOrderDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SalesOrderItem> {
    return this.commandBus.execute(
      new CancelSalesOrderCommand(id, dto.version, dto.reason, actorId),
    );
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_DELETE)
  @ApiOperation({ summary: 'Delete a draft order' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: true }> {
    return this.commandBus.execute(new DeleteSalesOrderCommand(id, actorId));
  }
}
