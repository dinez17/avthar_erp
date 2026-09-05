import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated } from '@tiles-erp/shared';
import type {
  AgeBucket,
  LowStockItem,
  LowStockOpenOrder,
  Paginated,
  PaginationQuery,
  StockAgeingItem,
  StockAgeingSummary,
  StockValuationItem,
  StockValuationSummary,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { ReportFilter, StockReportsRepository } from '../domain/reports.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const bucketFor = (ageDays: number | null): AgeBucket => {
  if (ageDays === null) return '90+';
  if (ageDays <= 30) return '0-30';
  if (ageDays <= 60) return '31-60';
  if (ageDays <= 90) return '61-90';
  return '90+';
};

const balanceWhere = (filter: ReportFilter, search?: string): Prisma.StockBalanceWhereInput => ({
  NOT: { qtyBoxes: 0 },
  ...(filter.branchId ? { branchId: filter.branchId } : {}),
  ...(filter.godownId ? { godownId: filter.godownId } : {}),
  product: {
    deletedAt: null,
    ...(filter.brandId ? { brandId: filter.brandId } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  },
});

const productSelect = {
  sku: true,
  name: true,
  piecesPerBox: true,
  baseUom: true,
  landingCost: true,
  reorderLevelBoxes: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.ProductSelect;

@Injectable()
export class PrismaStockReportsRepository implements StockReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async valuation(
    query: PaginationQuery,
    filter: ReportFilter,
  ): Promise<Paginated<StockValuationItem> & { summary: StockValuationSummary }> {
    const where = balanceWhere(filter, query.search);
    const include = {
      product: { select: productSelect },
      branch: { select: { name: true } },
      godown: { select: { name: true } },
    } satisfies Prisma.StockBalanceInclude;

    if (filter.groupByProduct) {
      return this.groupedValuation(query, where);
    }

    const [rows, total, allRows] = await this.prisma.$transaction([
      this.prisma.stockBalance.findMany({
        where,
        include,
        orderBy: [{ product: { name: 'asc' } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockBalance.count({ where }),
      // Totals span the whole filtered set, not just the current page.
      this.prisma.stockBalance.findMany({
        where,
        select: { qtyBoxes: true, product: { select: { landingCost: true } } },
      }),
    ]);

    let totalBoxes = 0;
    let totalValue = 0;
    let unvaluedRows = 0;
    for (const row of allRows) {
      const qty = Number(row.qtyBoxes);
      totalBoxes += qty;
      if (row.product.landingCost === null) unvaluedRows += 1;
      else totalValue += qty * Number(row.product.landingCost);
    }

    const items: StockValuationItem[] = rows.map((row) => {
      const qtyBoxes = round3(Number(row.qtyBoxes));
      const landingCost =
        row.product.landingCost === null ? null : Number(row.product.landingCost);
      return {
        productId: row.productId,
        sku: row.product.sku,
        productName: row.product.name,
        brandName: row.product.brand.name,
        categoryName: row.product.category.name,
        branchName: row.branch.name,
        godownName: row.godown.name,
        qtyBoxes,
        piecesPerBox: row.product.piecesPerBox,
        baseUom: row.product.baseUom,
        landingCost,
        value: landingCost === null ? null : round2(qtyBoxes * landingCost),
      };
    });

    return {
      ...buildPaginated(items, query.page, query.pageSize, total),
      summary: {
        totalBoxes: round3(totalBoxes),
        totalValue: round2(totalValue),
        unvaluedRows,
      },
    };
  }

  /** Valuation with batch/shade rows merged per product and godown. */
  private async groupedValuation(
    query: PaginationQuery,
    where: Prisma.StockBalanceWhereInput,
  ): Promise<Paginated<StockValuationItem> & { summary: StockValuationSummary }> {
    const grouped = await this.prisma.stockBalance.groupBy({
      by: ['productId', 'branchId', 'godownId'],
      where,
      _sum: { qtyBoxes: true },
    });

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...new Set(grouped.map((g) => g.productId))] } },
      select: { id: true, ...productSelect },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    let totalBoxes = 0;
    let totalValue = 0;
    let unvaluedRows = 0;
    for (const row of grouped) {
      const product = productById.get(row.productId);
      const qty = Number(row._sum.qtyBoxes ?? 0);
      totalBoxes += qty;
      if (!product || product.landingCost === null) unvaluedRows += 1;
      else totalValue += qty * Number(product.landingCost);
    }

    const page = grouped.slice(
      (query.page - 1) * query.pageSize,
      (query.page - 1) * query.pageSize + query.pageSize,
    );
    const [branches, godowns] = await Promise.all([
      this.prisma.branch.findMany({
        where: { id: { in: page.map((g) => g.branchId) } },
        select: { id: true, name: true },
      }),
      this.prisma.godown.findMany({
        where: { id: { in: page.map((g) => g.godownId) } },
        select: { id: true, name: true },
      }),
    ]);
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const godownName = new Map(godowns.map((g) => [g.id, g.name]));

    const items: StockValuationItem[] = [];
    for (const row of page) {
      const product = productById.get(row.productId);
      if (!product) continue;
      const qtyBoxes = round3(Number(row._sum.qtyBoxes ?? 0));
      const landingCost = product.landingCost === null ? null : Number(product.landingCost);
      items.push({
        productId: row.productId,
        sku: product.sku,
        productName: product.name,
        brandName: product.brand.name,
        categoryName: product.category.name,
        branchName: branchName.get(row.branchId) ?? '',
        godownName: godownName.get(row.godownId) ?? '',
        qtyBoxes,
        piecesPerBox: product.piecesPerBox,
        baseUom: product.baseUom,
        landingCost,
        value: landingCost === null ? null : round2(qtyBoxes * landingCost),
      });
    }

    items.sort((a, b) => a.productName.localeCompare(b.productName));
    return {
      ...buildPaginated(items, query.page, query.pageSize, grouped.length),
      summary: {
        totalBoxes: round3(totalBoxes),
        totalValue: round2(totalValue),
        unvaluedRows,
      },
    };
  }

  async ageing(
    query: PaginationQuery,
    filter: ReportFilter,
  ): Promise<Paginated<StockAgeingItem> & { summary: StockAgeingSummary }> {
    const where = balanceWhere(filter, query.search);
    const include = {
      product: { select: productSelect },
      branch: { select: { name: true } },
      godown: { select: { name: true } },
    } satisfies Prisma.StockBalanceInclude;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockBalance.findMany({
        where,
        include,
        orderBy: [{ product: { name: 'asc' } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockBalance.count({ where }),
    ]);

    // Age is measured from the most recent inward movement at that location.
    const lastInwards = await this.prisma.stockMovement.groupBy({
      by: ['productId', 'branchId', 'godownId'],
      where: {
        direction: 'IN',
        productId: { in: rows.map((r) => r.productId) },
      },
      _max: { movementDate: true },
    });
    const lastInwardBy = new Map(
      lastInwards.map((entry) => [
        `${entry.productId}|${entry.branchId}|${entry.godownId}`,
        entry._max.movementDate,
      ]),
    );

    const now = Date.now();
    const items: StockAgeingItem[] = rows.map((row) => {
      const lastInward = lastInwardBy.get(`${row.productId}|${row.branchId}|${row.godownId}`);
      const ageDays = lastInward
        ? Math.floor((now - lastInward.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const qtyBoxes = round3(Number(row.qtyBoxes));
      const landingCost =
        row.product.landingCost === null ? null : Number(row.product.landingCost);
      return {
        productId: row.productId,
        sku: row.product.sku,
        productName: row.product.name,
        brandName: row.product.brand.name,
        branchName: row.branch.name,
        godownName: row.godown.name,
        batchNo: row.batchNo,
        qtyBoxes,
        piecesPerBox: row.product.piecesPerBox,
        baseUom: row.product.baseUom,
        lastInwardDate: lastInward ? lastInward.toISOString() : null,
        ageDays,
        bucket: bucketFor(ageDays),
        value: landingCost === null ? null : round2(qtyBoxes * landingCost),
      };
    });

    const buckets: StockAgeingSummary['buckets'] = {
      '0-30': { boxes: 0, value: 0 },
      '31-60': { boxes: 0, value: 0 },
      '61-90': { boxes: 0, value: 0 },
      '90+': { boxes: 0, value: 0 },
    };
    for (const item of items) {
      buckets[item.bucket].boxes = round3(buckets[item.bucket].boxes + item.qtyBoxes);
      buckets[item.bucket].value = round2(buckets[item.bucket].value + (item.value ?? 0));
    }

    return {
      ...buildPaginated(items, query.page, query.pageSize, total),
      summary: { buckets },
    };
  }

  async lowStock(
    query: PaginationQuery,
    filter: ReportFilter,
  ): Promise<Paginated<LowStockItem>> {
    // Compare stock held per product per branch against the product's reorder level.
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        reorderLevelBoxes: { not: null },
        ...(filter.brandId ? { brandId: filter.brandId } : {}),
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, ...productSelect },
    });

    const grouped = await this.prisma.stockBalance.groupBy({
      by: ['productId', 'branchId'],
      where: {
        productId: { in: products.map((p) => p.id) },
        ...(filter.branchId ? { branchId: filter.branchId } : {}),
      },
      _sum: { qtyBoxes: true },
    });

    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null, ...(filter.branchId ? { id: filter.branchId } : {}) },
      select: { id: true, name: true },
    });

    const onHand = new Map(
      grouped.map((g) => [`${g.productId}|${g.branchId}`, Number(g._sum.qtyBoxes ?? 0)]),
    );

    // Quantities already on the way: pending boxes across open purchase orders.
    const openOrderLines = await this.prisma.purchaseOrderLine.findMany({
      where: {
        productId: { in: products.map((p) => p.id) },
        order: {
          deletedAt: null,
          status: { in: ['APPROVED', 'PARTIALLY_RECEIVED'] },
          ...(filter.branchId ? { branchId: filter.branchId } : {}),
        },
      },
      select: {
        productId: true,
        qtyBoxes: true,
        receivedBoxes: true,
        order: {
          select: {
            id: true,
            branchId: true,
            poNumber: true,
            orderDate: true,
            expectedDate: true,
            supplier: { select: { name: true } },
          },
        },
      },
    });

    const onOrder = new Map<string, { boxes: number; orders: LowStockOpenOrder[] }>();
    for (const line of openOrderLines) {
      const ordered = Number(line.qtyBoxes);
      const received = Number(line.receivedBoxes);
      const pending = round3(ordered - received);
      if (pending <= 0) continue;
      const key = `${line.productId}|${line.order.branchId}`;
      const entry = onOrder.get(key) ?? { boxes: 0, orders: [] };
      entry.boxes += pending;
      entry.orders.push({
        orderId: line.order.id,
        poNumber: line.order.poNumber,
        supplierName: line.order.supplier.name,
        orderDate: line.order.orderDate.toISOString(),
        expectedDate: line.order.expectedDate ? line.order.expectedDate.toISOString() : null,
        orderedBoxes: round3(ordered),
        receivedBoxes: round3(received),
        pendingBoxes: pending,
      });
      onOrder.set(key, entry);
    }

    const all: LowStockItem[] = [];
    for (const product of products) {
      const reorder = Number(product.reorderLevelBoxes ?? 0);
      for (const branch of branches) {
        const qtyBoxes = round3(onHand.get(`${product.id}|${branch.id}`) ?? 0);
        if (qtyBoxes > reorder) continue;
        const pending = onOrder.get(`${product.id}|${branch.id}`);
        const onOrderBoxes = round3(pending?.boxes ?? 0);
        const shortfallBoxes = round3(reorder - qtyBoxes);
        all.push({
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          brandName: product.brand.name,
          branchName: branch.name,
          qtyBoxes,
          piecesPerBox: product.piecesPerBox,
          baseUom: product.baseUom,
          reorderLevelBoxes: reorder,
          shortfallBoxes,
          onOrderBoxes,
          netShortfallBoxes: round3(Math.max(0, shortfallBoxes - onOrderBoxes)),
          openOrders: [...(pending?.orders ?? [])].sort((a, b) =>
            a.orderDate.localeCompare(b.orderDate),
          ),
        });
      }
    }

    // Genuinely uncovered items first, then by raw shortfall.
    all.sort((a, b) => b.netShortfallBoxes - a.netShortfallBoxes || b.shortfallBoxes - a.shortfallBoxes);
    const start = (query.page - 1) * query.pageSize;
    return buildPaginated(
      all.slice(start, start + query.pageSize),
      query.page,
      query.pageSize,
      all.length,
    );
  }
}
