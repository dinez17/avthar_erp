import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  BranchPriceItem,
  BranchPriceUpdateEntry,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { BranchPricesRepository } from '../domain/branch-prices.repository';
import type { ProductListFilter } from '../domain/products.repository';

const include = {
  brand: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof include }>;

type PriceRow = {
  productId: string;
  displayPrice: Prisma.Decimal;
  minSellingPrice: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  version: number;
};

const toItem = (product: ProductRow, price?: PriceRow): BranchPriceItem => ({
  productId: product.id,
  sku: product.sku,
  name: product.name,
  brandName: product.brand.name,
  categoryName: product.category.name,
  sizeMm: product.sizeMm,
  landingCost: product.landingCost === null ? null : Number(product.landingCost),
  displayPrice: price ? Number(price.displayPrice) : null,
  minSellingPrice: price ? Number(price.minSellingPrice) : null,
  sellingPrice: price ? Number(price.sellingPrice) : null,
  version: price?.version ?? 0,
});

@Injectable()
export class PrismaBranchPricesRepository implements BranchPricesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async assertBranch(branchId: UUID): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new ValidationError('Branch not found');
  }

  async list(
    branchId: UUID,
    query: PaginationQuery,
    filter: ProductListFilter,
  ): Promise<Paginated<BranchPriceItem>> {
    await this.assertBranch(branchId);

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.brandId ? { brandId: filter.brandId } : {}),
      ...(filter.seriesId ? { seriesId: filter.seriesId } : {}),
      ...(filter.sizeMm ? { sizeMm: filter.sizeMm } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    const prices = await this.prisma.productBranchPrice.findMany({
      where: { branchId, productId: { in: products.map((p) => p.id) } },
    });
    const byProduct = new Map(prices.map((p) => [p.productId, p as PriceRow]));

    return buildPaginated(
      products.map((product) => toItem(product, byProduct.get(product.id))),
      query.page,
      query.pageSize,
      total,
    );
  }

  async bulkUpsert(
    branchId: UUID,
    items: BranchPriceUpdateEntry[],
    actorId: UUID,
  ): Promise<BranchPriceItem[]> {
    await this.assertBranch(branchId);

    const productIds = items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, sku: true },
    });
    const missing = productIds.filter((id) => !products.some((p) => p.id === id));
    if (missing.length > 0) throw new NotFoundError(`Products not found: ${missing.join(', ')}`);

    const existing = await this.prisma.productBranchPrice.findMany({
      where: { branchId, productId: { in: productIds } },
      select: { productId: true, version: true },
    });
    const versionByProduct = new Map(existing.map((e) => [e.productId, e.version]));

    const stale = items.filter(
      (item) => (versionByProduct.get(item.productId) ?? 0) !== item.version,
    );
    if (stale.length > 0) {
      const skus = stale.map(
        (item) => products.find((p) => p.id === item.productId)?.sku ?? item.productId,
      );
      throw new ConflictError(
        `These prices changed since you loaded them: ${skus.join(', ')}. Reload and retry.`,
      );
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.productBranchPrice.upsert({
          where: { productId_branchId: { productId: item.productId, branchId } },
          create: {
            productId: item.productId,
            branchId,
            displayPrice: item.displayPrice,
            minSellingPrice: item.minSellingPrice,
            sellingPrice: item.sellingPrice,
            createdBy: actorId,
            updatedBy: actorId,
          },
          update: {
            displayPrice: item.displayPrice,
            minSellingPrice: item.minSellingPrice,
            sellingPrice: item.sellingPrice,
            updatedBy: actorId,
            version: { increment: 1 },
          },
        }),
      ),
    );

    const rows = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include,
      orderBy: { sku: 'asc' },
    });
    const updated = await this.prisma.productBranchPrice.findMany({
      where: { branchId, productId: { in: productIds } },
    });
    const priceByProduct = new Map(updated.map((p) => [p.productId, p as PriceRow]));
    return rows.map((product) => toItem(product, priceByProduct.get(product.id)));
  }
}
