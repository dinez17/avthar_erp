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
import type { Paginated, PurchaseOrderItem } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  ApprovePurchaseOrderCommand,
  CancelPurchaseOrderCommand,
  CreatePurchaseOrderCommand,
  GetPurchaseOrderQuery,
  ListPurchaseOrdersQuery,
  UpdatePurchaseOrderCommand,
} from '../application/purchase-order.handlers';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderListQueryDto,
  StatusChangeDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

@ApiTags('Purchase orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List purchase orders, newest first' })
  list(@Query() query: PurchaseOrderListQueryDto): Promise<Paginated<PurchaseOrderItem>> {
    return this.queryBus.execute(
      new ListPurchaseOrdersQuery(query, {
        supplierId: query.supplierId,
        branchId: query.branchId,
        status: query.status,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
      }),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_READ)
  @ApiOperation({ summary: 'Get a purchase order with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderItem> {
    return this.queryBus.execute(new GetPurchaseOrderQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Create a draft purchase order' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseOrderItem> {
    return this.commandBus.execute(new CreatePurchaseOrderCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_UPDATE)
  @ApiOperation({ summary: 'Update a draft purchase order' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseOrderItem> {
    return this.commandBus.execute(new UpdatePurchaseOrderCommand(id, dto, actorId));
  }

  @Patch(':id/approve')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_APPROVE)
  @ApiOperation({ summary: 'Approve a draft order, making it available for receipt' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusChangeDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseOrderItem> {
    return this.commandBus.execute(new ApprovePurchaseOrderCommand(id, dto.version, actorId));
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_CANCEL)
  @ApiOperation({ summary: 'Cancel an order that has not received goods' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusChangeDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseOrderItem> {
    return this.commandBus.execute(new CancelPurchaseOrderCommand(id, dto.version, actorId));
  }
}
