import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { CatalogItem, Paginated, PaginationQuery, UUID } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CatalogRepository,
  CreateCatalogData,
  UpdateCatalogData,
} from '../domain/catalog.repository';

const searchFilter = (search?: string): Prisma.StringFilter | undefined =>
  search ? { contains: search, mode: 'insensitive' } : undefined;

const pageArgs = (q: PaginationQuery): { skip: number; take: number } => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});

/** Category: standalone master, globally unique name. */
@Injectable()
export class PrismaCategoryRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toItem(row: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    isActive: boolean;
    version: number;
  }): CatalogItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      isActive: row.isActive,
      parentId: null,
      parentName: null,
      childCount: 0,
      supplierId: null,
      supplierName: null,
      version: row.version,
    };
  }

  async list(query: PaginationQuery): Promise<Paginated<CatalogItem>> {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      name: searchFilter(query.search),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({ where, orderBy: { name: 'asc' }, ...pageArgs(query) }),
      this.prisma.category.count({ where }),
    ]);
    return buildPaginated(rows.map((r) => this.toItem(r)), query.page, query.pageSize, total);
  }

  async create(data: CreateCatalogData): Promise<CatalogItem> {
    const dup = await this.prisma.category.findFirst({
      where: { name: { equals: data.name, mode: 'insensitive' }, deletedAt: null },
    });
    if (dup) throw new ConflictError(`Category "${data.name}" already exists`);
    const row = await this.prisma.category.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        isActive: data.isActive,
        createdBy: data.createdBy,
      },
    });
    return this.toItem(row);
  }

  async update(id: UUID, data: UpdateCatalogData): Promise<CatalogItem> {
    if (data.name !== undefined) {
      const dup = await this.prisma.category.findFirst({
        where: { name: { equals: data.name, mode: 'insensitive' }, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError(`Category "${data.name}" already exists`);
    }
    const updated = await this.prisma.category.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Category not found');
      throw new ConflictError('Category was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.category.findFirstOrThrow({ where: { id } });
    return this.toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.category.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Category not found');
  }
}

/** Brand: standalone master; blocks delete while series/collections exist. */
@Injectable()
export class PrismaBrandRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    _count: {
      select: {
        series: { where: { deletedAt: null } },
        collections: { where: { deletedAt: null } },
      },
    },
    supplier: { select: { name: true } },
  } satisfies Prisma.BrandInclude;

  private toItem(
    row: Prisma.BrandGetPayload<{
      include: {
        _count: { select: { series: true; collections: true } };
        supplier: { select: { name: true } };
      };
    }>,
  ): CatalogItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      isActive: row.isActive,
      parentId: null,
      parentName: null,
      childCount: row._count.series + row._count.collections,
      supplierId: row.supplierId,
      supplierName: row.supplier?.name ?? null,
      version: row.version,
    };
  }

  async list(query: PaginationQuery): Promise<Paginated<CatalogItem>> {
    const where: Prisma.BrandWhereInput = { deletedAt: null, name: searchFilter(query.search) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.brand.findMany({
        where,
        include: this.include,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.brand.count({ where }),
    ]);
    return buildPaginated(rows.map((r) => this.toItem(r)), query.page, query.pageSize, total);
  }

  async create(data: CreateCatalogData): Promise<CatalogItem> {
    const dup = await this.prisma.brand.findFirst({
      where: { name: { equals: data.name, mode: 'insensitive' }, deletedAt: null },
    });
    if (dup) throw new ConflictError(`Brand "${data.name}" already exists`);
    const row = await this.prisma.brand.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        isActive: data.isActive,
        supplierId: data.supplierId ?? null,
        createdBy: data.createdBy,
      },
      include: this.include,
    });
    return this.toItem(row);
  }

  async update(id: UUID, data: UpdateCatalogData): Promise<CatalogItem> {
    if (data.name !== undefined) {
      const dup = await this.prisma.brand.findFirst({
        where: { name: { equals: data.name, mode: 'insensitive' }, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError(`Brand "${data.name}" already exists`);
    }
    const updated = await this.prisma.brand.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.supplierId !== undefined ? { supplierId: data.supplierId } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.brand.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Brand not found');
      throw new ConflictError('Brand was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.brand.findFirstOrThrow({ where: { id }, include: this.include });
    return this.toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
      include: this.include,
    });
    if (!existing) throw new NotFoundError('Brand not found');
    if (existing._count.series + existing._count.collections > 0) {
      throw new ValidationError('Brand has series or collections. Delete them first.');
    }
    await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
  }
}

/** Series: belongs to a brand; name unique per brand. */
@Injectable()
export class PrismaSeriesRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = { brand: { select: { name: true } } } as const;

  private toItem(
    row: Prisma.SeriesGetPayload<{ include: { brand: { select: { name: true } } } }>,
  ): CatalogItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      isActive: row.isActive,
      parentId: row.brandId,
      parentName: row.brand.name,
      childCount: 0,
      supplierId: null,
      supplierName: null,
      version: row.version,
    };
  }

  async list(query: PaginationQuery, parentId?: UUID): Promise<Paginated<CatalogItem>> {
    const where: Prisma.SeriesWhereInput = {
      deletedAt: null,
      name: searchFilter(query.search),
      ...(parentId ? { brandId: parentId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.series.findMany({
        where,
        include: this.include,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.series.count({ where }),
    ]);
    return buildPaginated(rows.map((r) => this.toItem(r)), query.page, query.pageSize, total);
  }

  async create(data: CreateCatalogData): Promise<CatalogItem> {
    const parent = await this.prisma.brand.findFirst({
      where: { id: data.parentId ?? '', deletedAt: null },
    });
    if (!parent) throw new ValidationError('Parent brand not found');
    const dup = await this.prisma.series.findFirst({
      where: {
        brandId: parent.id,
        name: { equals: data.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (dup) throw new ConflictError(`Series "${data.name}" already exists for this brand`);
    const row = await this.prisma.series.create({
      data: {
        brandId: parent.id,
        name: data.name,
        code: data.code,
        description: data.description,
        isActive: data.isActive,
        createdBy: data.createdBy,
      },
      include: this.include,
    });
    return this.toItem(row);
  }

  async update(id: UUID, data: UpdateCatalogData): Promise<CatalogItem> {
    if (data.name !== undefined) {
      const current = await this.prisma.series.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundError('Series not found');
      const dup = await this.prisma.series.findFirst({
        where: {
          brandId: current.brandId,
          name: { equals: data.name, mode: 'insensitive' },
          deletedAt: null,
          id: { not: id },
        },
      });
      if (dup) throw new ConflictError(`Series "${data.name}" already exists for this brand`);
    }
    const updated = await this.prisma.series.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.series.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Series not found');
      throw new ConflictError('Series was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.series.findFirstOrThrow({ where: { id }, include: this.include });
    return this.toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.series.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Series not found');
  }
}

/** Collection: belongs to a brand; name unique per brand. */
@Injectable()
export class PrismaCollectionRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = { brand: { select: { name: true } } } as const;

  private toItem(
    row: Prisma.CollectionGetPayload<{ include: { brand: { select: { name: true } } } }>,
  ): CatalogItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      isActive: row.isActive,
      parentId: row.brandId,
      parentName: row.brand.name,
      childCount: 0,
      supplierId: null,
      supplierName: null,
      version: row.version,
    };
  }

  async list(query: PaginationQuery, parentId?: UUID): Promise<Paginated<CatalogItem>> {
    const where: Prisma.CollectionWhereInput = {
      deletedAt: null,
      name: searchFilter(query.search),
      ...(parentId ? { brandId: parentId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.collection.findMany({
        where,
        include: this.include,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.collection.count({ where }),
    ]);
    return buildPaginated(rows.map((r) => this.toItem(r)), query.page, query.pageSize, total);
  }

  async create(data: CreateCatalogData): Promise<CatalogItem> {
    const parent = await this.prisma.brand.findFirst({
      where: { id: data.parentId ?? '', deletedAt: null },
    });
    if (!parent) throw new ValidationError('Parent brand not found');
    const dup = await this.prisma.collection.findFirst({
      where: {
        brandId: parent.id,
        name: { equals: data.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (dup) throw new ConflictError(`Collection "${data.name}" already exists for this brand`);
    const row = await this.prisma.collection.create({
      data: {
        brandId: parent.id,
        name: data.name,
        code: data.code,
        description: data.description,
        isActive: data.isActive,
        createdBy: data.createdBy,
      },
      include: this.include,
    });
    return this.toItem(row);
  }

  async update(id: UUID, data: UpdateCatalogData): Promise<CatalogItem> {
    if (data.name !== undefined) {
      const current = await this.prisma.collection.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundError('Collection not found');
      const dup = await this.prisma.collection.findFirst({
        where: {
          brandId: current.brandId,
          name: { equals: data.name, mode: 'insensitive' },
          deletedAt: null,
          id: { not: id },
        },
      });
      if (dup) throw new ConflictError(`Collection "${data.name}" already exists for this brand`);
    }
    const updated = await this.prisma.collection.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.collection.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Collection not found');
      throw new ConflictError('Collection was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.collection.findFirstOrThrow({
      where: { id },
      include: this.include,
    });
    return this.toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.collection.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Collection not found');
  }
}
