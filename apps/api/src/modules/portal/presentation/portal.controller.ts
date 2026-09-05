import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  Paginated,
  PortalMe,
  PurchaseOrderItem,
  SupplierPortalBranch,
  SupplierPortalInvoice,
  SupplierPortalOrder,
  SupplierPortalOrderDetail,
  SupplierPortalPayment,
  SupplierPortalPoStockLine,
  SupplierPortalProduct,
  SupplierPortalSummary,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../core/http/dto/pagination-query.dto';
import { GetPortalMeQuery } from '../application/portal-account.handlers';
import {
  AcknowledgeOrderCommand,
  RaiseSupplierPoCommand,
  SupplierBranchesQuery,
  SupplierInvoicesQuery,
  SupplierOrderDetailQuery,
  SupplierOrdersQuery,
  SupplierPaymentsQuery,
  SupplierProductPoStockQuery,
  SupplierProductsQuery,
  SupplierSummaryQuery,
} from '../application/supplier-portal.handlers';
import { AcknowledgeOrderDto, RaiseSupplierPoDto } from './dto/portal.dto';

/**
 * The portal itself. These endpoints carry no permission — an external user holds none —
 * and are scoped instead to the parties the logged-in user is linked to. Every supplier
 * route re-checks that link before returning anything.
 */
@ApiTags('Portal')
@ApiBearerAuth()
@Controller('portal')
export class PortalController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'The current user and the parties they may act for' })
  me(@CurrentUser('id') userId: string): Promise<PortalMe> {
    return this.queryBus.execute(new GetPortalMeQuery(userId));
  }

  @Get('supplier/:supplierId/summary')
  @ApiOperation({ summary: "A supplier's dashboard: orders to acknowledge, unpaid, outstanding" })
  summary(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SupplierPortalSummary> {
    return this.queryBus.execute(new SupplierSummaryQuery(userId, supplierId));
  }

  @Get('supplier/:supplierId/orders')
  @ApiOperation({ summary: 'Purchase orders placed with the supplier' })
  orders(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser('id') userId: string,
  ): Promise<Paginated<SupplierPortalOrder>> {
    return this.queryBus.execute(new SupplierOrdersQuery(userId, supplierId, query));
  }

  @Get('supplier/:supplierId/orders/:orderId')
  @ApiOperation({ summary: 'One purchase order with its lines' })
  orderDetail(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SupplierPortalOrderDetail> {
    return this.queryBus.execute(new SupplierOrderDetailQuery(userId, supplierId, orderId));
  }

  @Post('supplier/:supplierId/orders/:orderId/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge a purchase order or raise a query against it' })
  acknowledge(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AcknowledgeOrderDto,
    @CurrentUser('id') userId: string,
  ): Promise<SupplierPortalOrder> {
    return this.commandBus.execute(
      new AcknowledgeOrderCommand(userId, supplierId, orderId, dto.decision, dto.note ?? null),
    );
  }

  @Get('supplier/:supplierId/invoices')
  @ApiOperation({ summary: 'Posted purchase invoices for the supplier' })
  invoices(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser('id') userId: string,
  ): Promise<Paginated<SupplierPortalInvoice>> {
    return this.queryBus.execute(new SupplierInvoicesQuery(userId, supplierId, query));
  }

  @Get('supplier/:supplierId/payments')
  @ApiOperation({ summary: 'Payments made to the supplier' })
  payments(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser('id') userId: string,
  ): Promise<Paginated<SupplierPortalPayment>> {
    return this.queryBus.execute(new SupplierPaymentsQuery(userId, supplierId, query));
  }

  @Get('supplier/:supplierId/products')
  @ApiOperation({ summary: "The supplier's products with company on-hand and PO stock" })
  products(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SupplierPortalProduct[]> {
    return this.queryBus.execute(new SupplierProductsQuery(userId, supplierId));
  }

  @Get('supplier/:supplierId/products/:productId/po-stock')
  @ApiOperation({ summary: 'The open orders behind one product’s PO stock' })
  productPoStock(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SupplierPortalPoStockLine[]> {
    return this.queryBus.execute(new SupplierProductPoStockQuery(userId, supplierId, productId));
  }

  @Get('supplier/:supplierId/branches')
  @ApiOperation({ summary: 'Branches the supplier may raise an order against' })
  branches(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SupplierPortalBranch[]> {
    return this.queryBus.execute(new SupplierBranchesQuery(userId, supplierId));
  }

  @Post('supplier/:supplierId/orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise a draft purchase order for the company to approve' })
  raiseOrder(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: RaiseSupplierPoDto,
    @CurrentUser('id') userId: string,
  ): Promise<PurchaseOrderItem> {
    return this.commandBus.execute(new RaiseSupplierPoCommand(userId, supplierId, dto));
  }
}
