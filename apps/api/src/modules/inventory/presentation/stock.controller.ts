import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import { buildPaginated, ValidationError } from '@tiles-erp/shared';
import type {
  BulkSetStockResult,
  AuthenticatedUser,
  Paginated,
  StockBalanceItem,
  StockCheckItem,
  StockMovementItem,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  BulkSetStockCommand,
  ListCountSheetQuery,
  ListStockBalancesQuery,
  ListStockMovementsQuery,
  PostAdjustmentCommand,
  PostOpeningStockCommand,
} from '../application/stock.handlers';
import {
  BulkSetStockDto,
  PostAdjustmentDto,
  PostOpeningStockDto,
  StockBalanceQueryDto,
  StockCheckQueryDto,
  SmartStockCheckQueryDto,
  StockMovementQueryDto,
  VerifySmartStockDto,
} from './dto/stock.dto';

@ApiTags('Stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly prisma: PrismaService,
  ) {}

  @Get('smart-check')
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Short prioritized queue for recurring physical stock checks' })
  async smartCheck(@Query() query: SmartStockCheckQueryDto) {
    const godown = await this.prisma.godown.findFirst({
      where: { id: query.godownId, branchId: query.branchId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!godown) throw new ValidationError('Godown does not belong to the selected branch');

    const balances = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { branchId: query.branchId, godownId: query.godownId, qtyBoxes: { gt: 0 } },
      _sum: { qtyBoxes: true },
    });
    const productIds = balances.map((row) => row.productId);
    const search = query.search?.trim();
    const [products, checks, movements] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          id: { in: productIds }, deletedAt: null,
          ...(search ? { OR: [
            { sku: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ] } : {}),
        },
        select: { id: true, sku: true, name: true, sizeMm: true, piecesPerBox: true, baseUom: true, brand: { select: { name: true } } },
      }),
      this.prisma.stockVerification.findMany({
        where: { branchId: query.branchId, godownId: query.godownId, productId: { in: productIds } },
        orderBy: { checkedAt: 'desc' },
        distinct: ['productId'],
        select: { productId: true, checkedAt: true, countedQtyBoxes: true, differenceBoxes: true },
      }),
      this.prisma.stockMovement.findMany({
        where: { branchId: query.branchId, godownId: query.godownId, productId: { in: productIds } },
        orderBy: { createdAt: 'desc' },
        distinct: ['productId'],
        select: { productId: true, createdAt: true },
      }),
    ]);
    const qty = new Map(balances.map((row) => [row.productId, Number(row._sum.qtyBoxes ?? 0)]));
    const checked = new Map(checks.map((row) => [row.productId, row]));
    const moved = new Map(movements.map((row) => [row.productId, row.createdAt]));
    const cutoff = Date.now() - query.intervalMinutes * 60_000;
    const rows = products.map((product) => {
      const last = checked.get(product.id);
      const lastMovementAt = moved.get(product.id) ?? null;
      return {
        productId: product.id, sku: product.sku, productName: product.name,
        brandName: product.brand.name, sizeMm: product.sizeMm,
        piecesPerBox: product.piecesPerBox, baseUom: product.baseUom,
        bookQtyBoxes: qty.get(product.id) ?? 0,
        lastCheckedAt: last?.checkedAt ?? null,
        lastCountedQtyBoxes: last ? Number(last.countedQtyBoxes) : null,
        lastDifferenceBoxes: last ? Number(last.differenceBoxes) : null,
        lastMovementAt,
        due: !last || last.checkedAt.getTime() <= cutoff,
      };
    });
    if (query.mode === 'RANDOM') rows.sort(() => Math.random() - 0.5);
    else if (query.mode === 'RECENT') rows.sort((a, b) => (b.lastMovementAt?.getTime() ?? 0) - (a.lastMovementAt?.getTime() ?? 0));
    else rows.sort((a, b) => Number(b.due) - Number(a.due)
      || (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0)
      || (b.lastMovementAt?.getTime() ?? 0) - (a.lastMovementAt?.getTime() ?? 0));
    return { items: rows.slice(0, 30), totalProducts: rows.length, dueProducts: rows.filter((row) => row.due).length };
  }

  @Post('smart-check')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Record a physical check and adjust stock when it differs' })
  async verifySmartStock(@Body() dto: VerifySmartStockDto, @CurrentUser('id') actorId: string) {
    const [product, balance] = await Promise.all([
      this.prisma.product.findFirst({ where: { id: dto.productId, deletedAt: null }, select: { piecesPerBox: true } }),
      this.prisma.stockBalance.aggregate({
        where: { productId: dto.productId, branchId: dto.branchId, godownId: dto.godownId },
        _sum: { qtyBoxes: true },
      }),
    ]);
    if (!product) throw new ValidationError('Product not found');
    const bookQtyBoxes = Number(balance._sum.qtyBoxes ?? 0);
    const countedQtyBoxes = Math.round((dto.boxes + dto.pieces / Math.max(1, product.piecesPerBox)) * 1000) / 1000;
    const differenceBoxes = Math.round((countedQtyBoxes - bookQtyBoxes) * 1000) / 1000;
    if (differenceBoxes !== 0) {
      await this.commandBus.execute(new BulkSetStockCommand({
        branchId: dto.branchId, godownId: dto.godownId,
        reason: 'Smart physical stock verification',
        lines: [{ productId: dto.productId, boxes: dto.boxes, pieces: dto.pieces }],
      }, actorId));
    }
    const verification = await this.prisma.stockVerification.create({ data: {
      productId: dto.productId, branchId: dto.branchId, godownId: dto.godownId,
      bookQtyBoxes, countedQtyBoxes, differenceBoxes, checkedBy: actorId,
    } });
    return { id: verification.id, bookQtyBoxes, countedQtyBoxes, differenceBoxes, adjusted: differenceBoxes !== 0 };
  }

  @Get('check/product/:productId')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'One product stock position across all branches' })
  async checkProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StockCheckItem[]> {
    const [product, branches, balances, poLines, transitLines, reservations] = await Promise.all([
      this.prisma.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: {
          id: true, sku: true, name: true, sizeMm: true, piecesPerBox: true, baseUom: true,
          brand: { select: { name: true } },
        },
      }),
      this.prisma.branch.findMany({
        where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' },
      }),
      this.prisma.stockBalance.groupBy({
        by: ['branchId'],
        where: { productId, godown: { deletedAt: null, isActive: true } },
        _sum: { qtyBoxes: true },
      }),
      this.prisma.purchaseOrderLine.findMany({
        where: {
          productId,
          order: { deletedAt: null, status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'] } },
        },
        select: {
          qtyBoxes: true,
          receivedBoxes: true,
          order: { select: { branchId: true, status: true } },
        },
      }),
      this.prisma.stockTransferLine.findMany({
        where: { productId, transfer: { status: 'IN_TRANSIT' } },
        select: { qtyBoxes: true, transfer: { select: { toBranchId: true } } },
      }),
      this.prisma.stockReservation.groupBy({
        by: ['branchId'], where: { productId, status: 'ACTIVE' }, _sum: { qtyBoxes: true },
      }),
    ]);
    if (!product) throw new ValidationError('Product not found');
    const current = new Map(balances.map((row) => [row.branchId, Number(row._sum.qtyBoxes ?? 0)]));
    const po = new Map<string, number>();
    const approvedPoTransit = new Map<string, number>();
    for (const line of poLines) {
      const pending = Math.max(0, Number(line.qtyBoxes) - Number(line.receivedBoxes));
      const target = line.order.status === 'DRAFT' ? po : approvedPoTransit;
      target.set(line.order.branchId, (target.get(line.order.branchId) ?? 0) + pending);
    }
    const transit = new Map<string, number>();
    for (const line of transitLines) {
      transit.set(line.transfer.toBranchId, (transit.get(line.transfer.toBranchId) ?? 0) + Number(line.qtyBoxes));
    }
    const held = new Map(reservations.map((row) => [row.branchId, Number(row._sum.qtyBoxes ?? 0)]));
    return branches
      .map((branch) => {
        const currentQtyBoxes = current.get(branch.id) ?? 0;
        const poQtyBoxes = po.get(branch.id) ?? 0;
        const inTransitQtyBoxes = (transit.get(branch.id) ?? 0)
          + (approvedPoTransit.get(branch.id) ?? 0);
        const holdQtyBoxes = held.get(branch.id) ?? 0;
        return {
          productId: product.id, sku: product.sku, productName: product.name,
          brandName: product.brand.name, sizeMm: product.sizeMm,
          piecesPerBox: product.piecesPerBox, baseUom: product.baseUom,
          branchId: branch.id, branchName: branch.name,
          currentQtyBoxes, poQtyBoxes, inTransitQtyBoxes, holdQtyBoxes,
          availableQtyBoxes: Math.max(0, currentQtyBoxes - holdQtyBoxes),
          expectedQtyBoxes: currentQtyBoxes + poQtyBoxes + inTransitQtyBoxes,
        };
      })
      .sort((left, right) => {
        const leftOwn = user.branchIds.includes(left.branchId) ? 0 : 1;
        const rightOwn = user.branchIds.includes(right.branchId) ? 0 : 1;
        return leftOwn - rightOwn || left.branchName.localeCompare(right.branchName);
      });
  }

  @Get('check')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Branch-wise current, PO, in-transit and held stock by product' })
  async check(@Query() query: StockCheckQueryDto): Promise<Paginated<StockCheckItem>> {
    const productWhere = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [branch, products, total] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: query.branchId, deletedAt: null }, select: { name: true } }),
      this.prisma.product.findMany({
        where: productWhere,
        select: {
          id: true, sku: true, name: true, sizeMm: true, piecesPerBox: true, baseUom: true,
          brand: { select: { name: true } },
        },
        orderBy: [{ name: 'asc' }, { sku: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where: productWhere }),
    ]);
    if (!branch) throw new ValidationError('Branch not found');
    const productIds = products.map((product) => product.id);
    const [balances, draftPoLines, approvedPoLines, transitLines, reservations] = await Promise.all([
      this.prisma.stockBalance.groupBy({
        by: ['productId'],
        where: {
          branchId: query.branchId,
          productId: { in: productIds },
          godown: { deletedAt: null, isActive: true },
        },
        _sum: { qtyBoxes: true },
      }),
      this.prisma.purchaseOrderLine.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
          order: { branchId: query.branchId, deletedAt: null, status: 'DRAFT' },
        },
        _sum: { qtyBoxes: true, receivedBoxes: true },
      }),
      this.prisma.purchaseOrderLine.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
          order: {
            branchId: query.branchId,
            deletedAt: null,
            status: { in: ['APPROVED', 'PARTIALLY_RECEIVED'] },
          },
        },
        _sum: { qtyBoxes: true, receivedBoxes: true },
      }),
      this.prisma.stockTransferLine.groupBy({
        by: ['productId'],
        where: { productId: { in: productIds }, transfer: { toBranchId: query.branchId, status: 'IN_TRANSIT' } },
        _sum: { qtyBoxes: true },
      }),
      this.prisma.stockReservation.groupBy({
        by: ['productId'],
        where: { branchId: query.branchId, productId: { in: productIds }, status: 'ACTIVE' },
        _sum: { qtyBoxes: true },
      }),
    ]);
    const current = new Map(balances.map((row) => [row.productId, Number(row._sum.qtyBoxes ?? 0)]));
    const po = new Map(draftPoLines.map((row) => [row.productId, Math.max(0, Number(row._sum.qtyBoxes ?? 0) - Number(row._sum.receivedBoxes ?? 0))]));
    const approvedPoTransit = new Map(approvedPoLines.map((row) => [row.productId, Math.max(0, Number(row._sum.qtyBoxes ?? 0) - Number(row._sum.receivedBoxes ?? 0))]));
    const transit = new Map(transitLines.map((row) => [row.productId, Number(row._sum.qtyBoxes ?? 0)]));
    const held = new Map(reservations.map((row) => [row.productId, Number(row._sum.qtyBoxes ?? 0)]));
    const items = products.map((product) => {
      const currentQtyBoxes = current.get(product.id) ?? 0;
      const poQtyBoxes = po.get(product.id) ?? 0;
      const inTransitQtyBoxes = (transit.get(product.id) ?? 0)
        + (approvedPoTransit.get(product.id) ?? 0);
      const holdQtyBoxes = held.get(product.id) ?? 0;
      return {
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        brandName: product.brand.name,
        sizeMm: product.sizeMm,
        piecesPerBox: product.piecesPerBox,
        baseUom: product.baseUom,
        branchId: query.branchId,
        branchName: branch.name,
        currentQtyBoxes,
        poQtyBoxes,
        inTransitQtyBoxes,
        holdQtyBoxes,
        availableQtyBoxes: Math.max(0, currentQtyBoxes - holdQtyBoxes),
        expectedQtyBoxes: currentQtyBoxes + poQtyBoxes + inTransitQtyBoxes,
      };
    });
    return buildPaginated(items, query.page, query.pageSize, total);
  }

  @Get('balances')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Current stock on hand by product, godown, batch and shade' })
  balances(@Query() query: StockBalanceQueryDto): Promise<Paginated<StockBalanceItem>> {
    return this.queryBus.execute(
      new ListStockBalancesQuery(query, {
        branchId: query.branchId,
        godownId: query.godownId,
        productId: query.productId,
        brandId: query.brandId,
        categoryId: query.categoryId,
        batchNo: query.batchNo,
        shade: query.shade,
        nonZeroOnly: query.nonZeroOnly ?? true,
        groupByProduct: query.groupByProduct ?? false,
      }),
    );
  }

  @Get('count-sheet')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({
    summary: 'Count sheet for a godown: every product listed, including those with no stock',
  })
  countSheet(@Query() query: StockBalanceQueryDto): Promise<Paginated<StockBalanceItem>> {
    if (!query.branchId || !query.godownId) {
      throw new ValidationError('branchId and godownId are required for a count sheet');
    }
    return this.queryBus.execute(
      new ListCountSheetQuery(query.branchId, query.godownId, query, {
        productId: query.productId,
        brandId: query.brandId,
        categoryId: query.categoryId,
        batchNo: query.batchNo,
        shade: query.shade,
      }),
    );
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Stock ledger, newest first' })
  movements(@Query() query: StockMovementQueryDto): Promise<Paginated<StockMovementItem>> {
    return this.queryBus.execute(
      new ListStockMovementsQuery(query, {
        branchId: query.branchId,
        godownId: query.godownId,
        productId: query.productId,
        type: query.type,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
      }),
    );
  }

  @Post('opening')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_OPENING)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Post opening stock for a branch (once per product/godown)' })
  async opening(
    @Body() dto: PostOpeningStockDto,
    @CurrentUser('id') actorId: string,
  ): Promise<{ posted: number }> {
    const posted = await this.commandBus.execute(new PostOpeningStockCommand(dto, actorId));
    return { posted };
  }

  @Post('count')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({
    summary: 'Set counted stock levels in bulk; adjustments are posted for the differences',
  })
  count(
    @Body() dto: BulkSetStockDto,
    @CurrentUser('id') actorId: string,
  ): Promise<BulkSetStockResult> {
    return this.commandBus.execute(new BulkSetStockCommand(dto, actorId));
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Post a stock adjustment (positive or negative lines)' })
  async adjust(
    @Body() dto: PostAdjustmentDto,
    @CurrentUser('id') actorId: string,
  ): Promise<{ posted: number }> {
    const posted = await this.commandBus.execute(new PostAdjustmentCommand(dto, actorId));
    return { posted };
  }
}
