import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildPaginated,
  calculateLandingCost,
  checkSqftPerBox,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@tiles-erp/shared';
import type {
  AreaAudit,
  AreaAuditRow,
  Paginated,
  PaginationQuery,
  ProductItem,
  ProductRateUpdateEntry,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CreateProductData,
  ProductListFilter,
  ProductsRepository,
  UpdateProductData,
} from '../domain/products.repository';

const include = {
  category: { select: { name: true } },
  brand: { select: { name: true } },
  series: { select: { name: true } },
  collection: { select: { name: true } },
} satisfies Prisma.ProductInclude;

type Row = Prisma.ProductGetPayload<{ include: typeof include }>;

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

const toItem = (row: Row): ProductItem => {
  const sqftPerBox = Number(row.sqftPerBox);
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    brandId: row.brandId,
    brandName: row.brand.name,
    seriesId: row.seriesId,
    seriesName: row.series?.name ?? null,
    collectionId: row.collectionId,
    collectionName: row.collection?.name ?? null,
    sizeMm: row.sizeMm,
    piecesPerBox: row.piecesPerBox,
    sqftPerBox,
    sqftPerPiece: row.piecesPerBox > 0 ? round4(sqftPerBox / row.piecesPerBox) : 0,
    baseUom: row.baseUom,
    hsnCode: row.hsnCode,
    gstRate: Number(row.gstRate),
    mrp: row.mrp === null ? null : Number(row.mrp),
    sellingRate: row.sellingRate === null ? null : Number(row.sellingRate),
    reorderLevelBoxes: row.reorderLevelBoxes === null ? null : Number(row.reorderLevelBoxes),
    purchaseRate: row.purchaseRate === null ? null : Number(row.purchaseRate),
    transportRate: Number(row.transportRate),
    additionalRate: Number(row.additionalRate),
    landingCost: row.landingCost === null ? null : Number(row.landingCost),
    barcode: row.barcode,
    isActive: row.isActive,
    sixorbitSyncStatus: row.sixorbitSyncStatus,
    sixorbitId: row.sixorbitId,
    sixorbitSyncError: row.sixorbitSyncError,
    version: row.version,
  };
};

@Injectable()
export class PrismaProductsRepository implements ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async assertReferences(data: {
    categoryId?: UUID;
    brandId?: UUID;
    seriesId?: UUID | null;
    collectionId?: UUID | null;
  }): Promise<void> {
    if (data.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: data.categoryId, deletedAt: null },
      });
      if (!category) throw new ValidationError('Category not found');
    }
    if (data.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: data.brandId, deletedAt: null },
      });
      if (!brand) throw new ValidationError('Brand not found');
    }
    if (data.seriesId) {
      const series = await this.prisma.series.findFirst({
        where: { id: data.seriesId, deletedAt: null },
      });
      if (!series) throw new ValidationError('Series not found');
      if (data.brandId && series.brandId !== data.brandId) {
        throw new ValidationError('Series does not belong to the selected brand');
      }
    }
    if (data.collectionId) {
      const collection = await this.prisma.collection.findFirst({
        where: { id: data.collectionId, deletedAt: null },
      });
      if (!collection) throw new ValidationError('Collection not found');
      if (data.brandId && collection.brandId !== data.brandId) {
        throw new ValidationError('Collection does not belong to the selected brand');
      }
    }
  }

  private async assertUnique(
    sku?: string,
    barcode?: string | null,
    excludeId?: UUID,
  ): Promise<void> {
    if (sku) {
      const dup = await this.prisma.product.findFirst({
        where: {
          sku: { equals: sku, mode: 'insensitive' },
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      if (dup) throw new ConflictError(`SKU "${sku}" is already in use`);
    }
    if (barcode) {
      const dup = await this.prisma.product.findFirst({
        where: { barcode, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      });
      if (dup) throw new ConflictError(`Barcode "${barcode}" is already in use`);
    }
  }

  async list(query: PaginationQuery, filter: ProductListFilter): Promise<Paginated<ProductItem>> {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.brandId ? { brandId: filter.brandId } : {}),
      ...(filter.seriesId ? { seriesId: filter.seriesId } : {}),
      ...(filter.sizeMm ? { sizeMm: filter.sizeMm } : {}),
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
              { hsnCode: { contains: query.search } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sortBy === 'name' || query.sortBy === 'sku' || query.sortBy === 'createdAt'
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { name: 'asc' };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async listSizes(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { deletedAt: null, sizeMm: { not: null } },
      distinct: ['sizeMm'],
      select: { sizeMm: true },
      orderBy: { sizeMm: 'asc' },
    });
    return rows.map((r) => r.sizeMm).filter((v): v is string => v !== null && v.length > 0);
  }

  async findById(id: UUID): Promise<ProductItem | null> {
    const row = await this.prisma.product.findFirst({ where: { id, deletedAt: null }, include });
    return row ? toItem(row) : null;
  }

  async create(data: CreateProductData): Promise<ProductItem> {
    await this.assertReferences(data);
    await this.assertUnique(data.sku, data.barcode);
    const row = await this.prisma.product.create({
      data: {
        sku: data.sku,
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
        brandId: data.brandId,
        seriesId: data.seriesId,
        collectionId: data.collectionId,
        sizeMm: data.sizeMm,
        piecesPerBox: data.piecesPerBox,
        sqftPerBox: data.sqftPerBox,
        baseUom: data.baseUom,
        hsnCode: data.hsnCode,
        gstRate: data.gstRate,
        mrp: data.mrp,
        sellingRate: data.sellingRate,
        barcode: data.barcode,
        reorderLevelBoxes: data.reorderLevelBoxes,
        isActive: data.isActive,
        createdBy: data.createdBy,
      },
      include,
    });
    return toItem(row);
  }

  async update(id: UUID, data: UpdateProductData): Promise<ProductItem> {
    await this.assertReferences(data);
    await this.assertUnique(data.sku, data.barcode ?? undefined, id);
    const { updatedBy, version, ...fields } = data;
    const updated = await this.prisma.product.updateMany({
      where: { id, deletedAt: null, version },
      data: {
        ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
        updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Product not found');
      throw new ConflictError('Product was modified by someone else. Reload and retry.');
    }
    let row = await this.prisma.product.findFirstOrThrow({ where: { id }, include });
    if (row.purchaseRate !== null) {
      const landingCost = calculateLandingCost(
        Number(row.purchaseRate),
        Number(row.transportRate),
        Number(row.additionalRate),
        Number(row.gstRate),
      );
      if (row.landingCost === null || Number(row.landingCost) !== landingCost) {
        row = await this.prisma.product.update({ where: { id }, data: { landingCost }, include });
      }
    }
    return toItem(row);
  }

  async bulkUpdateRates(items: ProductRateUpdateEntry[], updatedBy: UUID): Promise<ProductItem[]> {
    const ids = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, sku: true, gstRate: true, version: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new NotFoundError(`Products not found: ${missing.join(', ')}`);
    }
    const stale = items.filter((item) => byId.get(item.productId)?.version !== item.version);
    if (stale.length > 0) {
      const skus = stale.map((item) => byId.get(item.productId)?.sku ?? item.productId);
      throw new ConflictError(
        `These products changed since you loaded them: ${skus.join(', ')}. Reload and retry.`,
      );
    }

    await this.prisma.$transaction(
      items.map((item) => {
        // An explicit gstRate corrects the product's stored rate; otherwise keep it.
        const gstRate = item.gstRate ?? Number(byId.get(item.productId)?.gstRate ?? 0);
        return this.prisma.product.update({
          where: { id: item.productId },
          data: {
            purchaseRate: item.purchaseRate,
            transportRate: item.transportRate,
            additionalRate: item.additionalRate,
            ...(item.gstRate !== undefined ? { gstRate: item.gstRate } : {}),
            landingCost: calculateLandingCost(
              item.purchaseRate,
              item.transportRate,
              item.additionalRate,
              gstRate,
            ),
            updatedBy,
            version: { increment: 1 },
          },
        });
      }),
    );

    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include,
      orderBy: { sku: 'asc' },
    });
    return rows.map(toItem);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.product.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Product not found');
  }

  /**
   * Every product whose recorded area disagrees with the size printed on its own box.
   *
   * Stock in hand is carried alongside because it decides urgency: a wrong figure on a
   * product nobody holds is a typo, and the same figure on 138 boxes is a valuation
   * nobody should be reading.
   */
  async auditArea(): Promise<AreaAudit> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        sizeMm: true,
        piecesPerBox: true,
        sqftPerBox: true,
      },
      orderBy: { sku: 'asc' },
    });

    const suspects: { row: Omit<AreaAuditRow, 'stockBoxes'>; id: string }[] = [];
    let checked = 0;
    let unreadable = 0;

    for (const product of products) {
      const check = checkSqftPerBox(
        product.sizeMm,
        product.piecesPerBox,
        Number(product.sqftPerBox),
      );
      if (check.verdict === 'UNKNOWN') {
        unreadable += 1;
        continue;
      }
      checked += 1;
      if (check.verdict === 'OK') continue;

      suspects.push({
        id: product.id,
        row: {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          sizeMm: product.sizeMm,
          piecesPerBox: product.piecesPerBox,
          storedSqftPerBox: Number(product.sqftPerBox),
          expectedSqftPerBox: check.expected!,
          ratio: check.ratio!,
          likelyCause: check.likelyCause ?? 'Does not match the size',
        },
      });
    }

    const held = await this.prisma.stockBalance.groupBy({
      by: ['productId'],
      where: { productId: { in: suspects.map((suspect) => suspect.id) } },
      _sum: { qtyBoxes: true },
    });
    const boxesByProduct = new Map(
      held.map((row) => [row.productId, Number(row._sum.qtyBoxes ?? 0)]),
    );

    return {
      checked,
      unreadable,
      // Worst first by what it would distort: the error times what is held.
      rows: suspects
        .map((suspect) => ({
          ...suspect.row,
          stockBoxes: boxesByProduct.get(suspect.id) ?? 0,
        }))
        .sort(
          (a, b) =>
            Math.abs(b.storedSqftPerBox - b.expectedSqftPerBox) * (b.stockBoxes || 1) -
            Math.abs(a.storedSqftPerBox - a.expectedSqftPerBox) * (a.stockBoxes || 1),
        ),
    };
  }

  /**
   * Writes the figure the size implies over the one that was typed.
   *
   * Only ever applied to products the audit itself flagged — recomputing every product
   * would quietly round the honest ones, and a "600x600" that is really 597x597 is
   * allowed to say 11.4 rather than 11.625.
   */
  async fixArea(productIds: UUID[] | undefined, updatedBy: UUID): Promise<{ fixed: number }> {
    const audit = await this.auditArea();
    const wanted = productIds && productIds.length > 0 ? new Set(productIds) : null;
    const targets = audit.rows.filter((row) => !wanted || wanted.has(row.productId));

    let fixed = 0;
    for (const row of targets) {
      await this.prisma.product.update({
        where: { id: row.productId },
        data: { sqftPerBox: row.expectedSqftPerBox, updatedBy, version: { increment: 1 } },
      });
      fixed += 1;
    }
    return { fixed };
  }
}
