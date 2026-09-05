import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { DepartmentListItem, Paginated, PaginationQuery, UUID } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CreateDepartmentData,
  DepartmentsRepository,
  UpdateDepartmentData,
} from '../domain/departments.repository';

const include = { _count: { select: { users: true } } } satisfies Prisma.DepartmentInclude;
type Row = Prisma.DepartmentGetPayload<{ include: typeof include }>;

const toItem = (d: Row): DepartmentListItem => ({
  id: d.id,
  name: d.name,
  description: d.description,
  isActive: d.isActive,
  userCount: d._count.users,
  version: d.version,
});

@Injectable()
export class PrismaDepartmentsRepository implements DepartmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQuery): Promise<Paginated<DepartmentListItem>> {
    const where: Prisma.DepartmentWhereInput = {
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        include,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.department.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async nameExists(name: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.department.findFirst({
      where: { name, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  async create(data: CreateDepartmentData): Promise<DepartmentListItem> {
    const row = await this.prisma.department.create({ data, include });
    return toItem(row);
  }

  async update(id: UUID, data: UpdateDepartmentData): Promise<DepartmentListItem> {
    const updated = await this.prisma.department.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.department.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Department not found');
      throw new ConflictError('Department was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.department.findFirstOrThrow({ where: { id }, include });
    return toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.department.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    if (!existing) throw new NotFoundError('Department not found');
    if (existing._count.users > 0) {
      throw new ValidationError('Department has assigned users. Unassign them first.');
    }
    await this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
  }
}
