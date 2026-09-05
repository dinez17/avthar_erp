import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildPaginated } from '@tiles-erp/shared';
import type {
  Paginated,
  PaginationQuery,
  StockBalanceItem,
  StockMovementItem,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  MovementFilter,
  MovementPosting,
  StockBalanceFilter,
  StockRepository,
} from '../domain/stock.repository';

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Null-safe equality for the optional dimensions that form the balance key.
 *
 * For **writing**: a movement into gate G, batch B must land on exactly that row, so a
 * missing dimension really does mean the row where it is null.
 */
const dimensionWhere = (posting: {
  gateId?: UUID | null;
  batchNo?: string | null;
  shade?: string | null;
}): Prisma.StockBalanceWhereInput => ({
  gateId: posting.gateId ?? null,
  batchNo: posting.batchNo ?? null,
  shade: posting.shade ?? null,
});

/**
 * The same dimensions, for **reading** what is on hand.
 *
 * Here a missing dimension means "any", not "the null one". Asking how much of a product
 * a godown holds, without naming a gate, must count the stock standing at its gates —
 * otherwise a godown with 138 pieces at a gate answers zero, and every check built on
 * that answer refuses work that is perfectly possible.
 */
const availabilityWhere = (key: {
  gateId?: UUID | null;
  batchNo?: string | null;
  shade?: string | null;
}): Prisma.StockBalanceWhereInput => ({
  ...(key.gateId ? { gateId: key.gateId } : {}),
  ...(key.batchNo ? { batchNo: key.batchNo } : {}),
  ...(key.shade ? { shade: key.shade } : {}),
});

@Injectable()
export class PrismaStockRepository implements StockRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes movements and applies their net effect to the balance projection in one
   * transaction. Balances are never edited anywhere else in the system.
   */
  async postMovements(postings: MovementPosting[]): Promise<number> {
    if (postings.length === 0) return 0;

    await this.prisma.$transaction(async (tx) => {
      for (const posting of postings) {
        await tx.stockMovement.create({
          data: {
            productId: posting.productId,
            branchId: posting.branchId,
            godownId: posting.godownId,
            gateId: posting.gateId ?? null,
            batchNo: posting.batchNo ?? null,
            shade: posting.shade ?? null,
            type: posting.type,
            direction: posting.direction,
            qtyBoxes: posting.qtyBoxes,
            refType: posting.refType ?? null,
            refId: posting.refId ?? null,
            refNumber: posting.refNumber ?? null,
            reason: posting.reason ?? null,
            remarks: posting.remarks ?? null,
            movementDate: posting.movementDate,
            createdBy: posting.createdBy,
          },
        });

        const delta = posting.direction === 'IN' ? posting.qtyBoxes : -posting.qtyBoxes;
        const existing = await tx.stockBalance.findFirst({
          where: {
            productId: posting.productId,
            branchId: posting.branchId,
            godownId: posting.godownId,
            ...dimensionWhere(posting),
          },
          select: { id: true },
        });

        if (existing) {
          await tx.stockBalance.update({
            where: { id: existing.id },
            data: { qtyBoxes: { increment: delta } },
          });
        } else {
          await tx.stockBalance.create({
            data: {
              productId: posting.productId,
              branchId: posting.branchId,
              godownId: posting.godownId,
              gateId: posting.gateId ?? null,
              batchNo: posting.batchNo ?? null,
              shade: posting.shade ?? null,
              qtyBoxes: delta,
            },
          });
        }
      }
    });

    return postings.length;
  }

  async currentQty(key: {
    productId: UUID;
    branchId: UUID;
    godownId: UUID;
    gateId?: UUID | null;
    batchNo?: string | null;
    shade?: string | null;
  }): Promise<number> {
    const rows = await this.prisma.stockBalance.findMany({
      where: {
        productId: key.productId,
        branchId: key.branchId,
        godownId: key.godownId,
        ...availabilityWhere(key),
      },
      select: { qtyBoxes: true },
    });
    return round3(rows.reduce((sum, row) => sum + Number(row.qtyBoxes), 0));
  }

  async hasOpeningStock(branchId: UUID, productId: UUID, godownId: UUID): Promise<boolean> {
    const row = await this.prisma.stockMovement.findFirst({
      where: { branchId, productId, godownId, type: 'OPENING' },
      select: { id: true },
    });
    return row !== null;
  }

  async productConversions(
    productIds: UUID[],
  ): Promise<Map<UUID, { piecesPerBox: number; sku: string }>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, sku: true, piecesPerBox: true },
    });
    return new Map(rows.map((r) => [r.id, { piecesPerBox: r.piecesPerBox, sku: r.sku }]));
  }

  async currentQtyMany(
    branchId: UUID,
    godownId: UUID,
    gateId: UUID | null,
    keys: { productId: UUID; batchNo?: string | null; shade?: string | null }[],
  ): Promise<Map<string, number>> {
    if (keys.length === 0) return new Map();
    const rows = await this.prisma.stockBalance.groupBy({
      by: ['productId', 'batchNo', 'shade'],
      where: {
        branchId,
        godownId,
        // Named gate only when one was asked for; otherwise every gate counts.
        ...(gateId ? { gateId } : {}),
        productId: { in: [...new Set(keys.map((k) => k.productId))] },
      },
      _sum: { qtyBoxes: true },
    });
    return new Map(
      rows.map((r) => [
        `${r.productId}|${r.batchNo ?? ''}|${r.shade ?? ''}`,
        round3(Number(r._sum.qtyBoxes ?? 0)),
      ]),
    );
  }

  /**
   * Aggregates batch/shade rows into a single line per product and godown, for the
   * summary view. Batch and shade come back null because the row spans all of them.
   */
  private async listGroupedBalances(
    query: PaginationQuery,
    where: Prisma.StockBalanceWhereInput,
  ): Promise<Paginated<StockBalanceItem>> {
    const grouped = await this.prisma.stockBalance.groupBy({
      by: ['productId', 'branchId', 'godownId'],
      where,
      _sum: { qtyBoxes: true },
    });

    const page = grouped.slice(
      (query.page - 1) * query.pageSize,
      (query.page - 1) * query.pageSize + query.pageSize,
    );

    const [products, branches, godowns] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: page.map((g) => g.productId) } },
        select: {
          id: true,
          sku: true,
          name: true,
          sizeMm: true,
          piecesPerBox: true,
          sqftPerBox: true,
          baseUom: true,
          landingCost: true,
          gstRate: true,
          brand: { select: { name: true } },
        },
      }),
      this.prisma.branch.findMany({
        where: { id: { in: page.map((g) => g.branchId) } },
        select: { id: true, name: true },
      }),
      this.prisma.godown.findMany({
        where: { id: { in: page.map((g) => g.godownId) } },
        select: { id: true, name: true },
      }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const godownName = new Map(godowns.map((g) => [g.id, g.name]));

    const items: StockBalanceItem[] = [];
    for (const row of page) {
      const product = productById.get(row.productId);
      if (!product) continue;
      const qtyBoxes = round3(Number(row._sum.qtyBoxes ?? 0));
      items.push({
        productId: row.productId,
        sku: product.sku,
        productName: product.name,
        brandName: product.brand.name,
        sizeMm: product.sizeMm,
        branchId: row.branchId,
        branchName: branchName.get(row.branchId) ?? '',
        godownId: row.godownId,
        godownName: godownName.get(row.godownId) ?? '',
        gateId: null,
        gateName: null,
        batchNo: null,
        shade: null,
        qtyBoxes,
        qtyPieces: round3(qtyBoxes * product.piecesPerBox),
        qtySqft: round3(qtyBoxes * Number(product.sqftPerBox)),
        piecesPerBox: product.piecesPerBox,
        baseUom: product.baseUom,
        landingCost: Number(product.landingCost ?? 0),
        gstRate: Number(product.gstRate),
      });
    }

    items.sort((a, b) => a.productName.localeCompare(b.productName));
    return buildPaginated(items, query.page, query.pageSize, grouped.length);
  }

  async listBalances(
    query: PaginationQuery,
    filter: StockBalanceFilter,
  ): Promise<Paginated<StockBalanceItem>> {
    const where: Prisma.StockBalanceWhereInput = {
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.godownId ? { godownId: filter.godownId } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.batchNo ? { batchNo: filter.batchNo } : {}),
      ...(filter.shade ? { shade: filter.shade } : {}),
      ...(filter.nonZeroOnly ? { NOT: { qtyBoxes: 0 } } : {}),
      ...(filter.brandId || filter.categoryId || query.search
        ? {
            product: {
              deletedAt: null,
              ...(filter.brandId ? { brandId: filter.brandId } : {}),
              ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
              ...(query.search
                ? {
                    OR: [
                      { name: { contains: query.search, mode: 'insensitive' as const } },
                      { sku: { contains: query.search, mode: 'insensitive' as const } },
                    ],
                  }
                : {}),
            },
          }
        : { product: { deletedAt: null } }),
    };

    if (filter.groupByProduct) {
      return this.listGroupedBalances(query, where);
    }

    const include = {
      product: {
        select: {
          sku: true,
          name: true,
          sizeMm: true,
          piecesPerBox: true,
          sqftPerBox: true,
          baseUom: true,
          landingCost: true,
          gstRate: true,
          brand: { select: { name: true } },
        },
      },
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

    const gateIds = rows.map((r) => r.gateId).filter((v): v is string => v !== null);
    const gates = gateIds.length
      ? await this.prisma.gate.findMany({
          where: { id: { in: gateIds } },
          select: { id: true, name: true },
        })
      : [];
    const gateName = new Map(gates.map((g) => [g.id, g.name]));

    return buildPaginated(
      rows.map((row) => {
        const qtyBoxes = Number(row.qtyBoxes);
        return {
          productId: row.productId,
          sku: row.product.sku,
          productName: row.product.name,
          brandName: row.product.brand.name,
          sizeMm: row.product.sizeMm,
          branchId: row.branchId,
          branchName: row.branch.name,
          godownId: row.godownId,
          godownName: row.godown.name,
          gateId: row.gateId,
          gateName: row.gateId ? (gateName.get(row.gateId) ?? null) : null,
          batchNo: row.batchNo,
          shade: row.shade,
          qtyBoxes: round3(qtyBoxes),
          qtyPieces: round3(qtyBoxes * row.product.piecesPerBox),
          qtySqft: round3(qtyBoxes * Number(row.product.sqftPerBox)),
          piecesPerBox: row.product.piecesPerBox,
          baseUom: row.product.baseUom,
          landingCost: Number(row.product.landingCost ?? 0),
          gstRate: Number(row.product.gstRate),
        };
      }),
      query.page,
      query.pageSize,
      total,
    );
  }

  async listCountSheet(
    branchId: UUID,
    godownId: UUID,
    query: PaginationQuery,
    filter: StockBalanceFilter,
  ): Promise<Paginated<StockBalanceItem>> {
    // Products drive the page so items with no stock still appear.
    const productWhere: Prisma.ProductWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(filter.productId ? { id: filter.productId } : {}),
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
    };

    const [products, total, branch, godown] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: productWhere,
        select: {
          id: true,
          sku: true,
          name: true,
          sizeMm: true,
          piecesPerBox: true,
          sqftPerBox: true,
          baseUom: true,
          landingCost: true,
          gstRate: true,
          brand: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where: productWhere }),
      this.prisma.branch.findFirstOrThrow({ where: { id: branchId }, select: { name: true } }),
      this.prisma.godown.findFirstOrThrow({ where: { id: godownId }, select: { name: true } }),
    ]);

    const balances = await this.prisma.stockBalance.findMany({
      where: {
        branchId,
        godownId,
        productId: { in: products.map((p) => p.id) },
        ...(filter.batchNo ? { batchNo: filter.batchNo } : {}),
        ...(filter.shade ? { shade: filter.shade } : {}),
      },
    });
    const byProduct = new Map<string, typeof balances>();
    for (const balance of balances) {
      byProduct.set(balance.productId, [...(byProduct.get(balance.productId) ?? []), balance]);
    }

    const items: StockBalanceItem[] = [];
    for (const product of products) {
      const base = {
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        brandName: product.brand.name,
        sizeMm: product.sizeMm,
        branchId,
        branchName: branch.name,
        godownId,
        godownName: godown.name,
        gateId: null,
        gateName: null,
        piecesPerBox: product.piecesPerBox,
        baseUom: product.baseUom,
        landingCost: Number(product.landingCost ?? 0),
        gstRate: Number(product.gstRate),
      };
      const rows = byProduct.get(product.id) ?? [];
      if (rows.length === 0) {
        items.push({
          ...base,
          batchNo: null,
          shade: null,
          qtyBoxes: 0,
          qtyPieces: 0,
          qtySqft: 0,
        });
        continue;
      }
      for (const row of rows) {
        const qtyBoxes = Number(row.qtyBoxes);
        items.push({
          ...base,
          gateId: row.gateId,
          batchNo: row.batchNo,
          shade: row.shade,
          qtyBoxes: round3(qtyBoxes),
          qtyPieces: round3(qtyBoxes * product.piecesPerBox),
          qtySqft: round3(qtyBoxes * Number(product.sqftPerBox)),
        });
      }
    }

    return buildPaginated(items, query.page, query.pageSize, total);
  }

  async listMovements(
    query: PaginationQuery,
    filter: MovementFilter,
  ): Promise<Paginated<StockMovementItem>> {
    const where: Prisma.StockMovementWhereInput = {
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.godownId ? { godownId: filter.godownId } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            movementDate: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { product: { sku: { contains: query.search, mode: 'insensitive' } } },
              { product: { name: { contains: query.search, mode: 'insensitive' } } },
              { refNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const include = {
      product: { select: { sku: true, name: true } },
      branch: { select: { name: true } },
      godown: { select: { name: true } },
      gate: { select: { name: true } },
    } satisfies Prisma.StockMovementInclude;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include,
        orderBy: { movementDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        sku: row.product.sku,
        productName: row.product.name,
        branchId: row.branchId,
        branchName: row.branch.name,
        godownId: row.godownId,
        godownName: row.godown.name,
        gateId: row.gateId,
        gateName: row.gate?.name ?? null,
        batchNo: row.batchNo,
        shade: row.shade,
        type: row.type,
        direction: row.direction,
        qtyBoxes: Number(row.qtyBoxes),
        refType: row.refType,
        refNumber: row.refNumber,
        reason: row.reason,
        remarks: row.remarks,
        movementDate: row.movementDate.toISOString(),
        createdBy: row.createdBy,
      })),
      query.page,
      query.pageSize,
      total,
    );
  }
}
