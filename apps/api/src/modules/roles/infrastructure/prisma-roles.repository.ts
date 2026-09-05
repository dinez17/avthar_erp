import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { Paginated, PaginationQuery, RoleListItem, UUID } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { CreateRoleData, RolesRepository, UpdateRoleData } from '../domain/roles.repository';

const include = {
  permissions: { include: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

type Row = Prisma.RoleGetPayload<{ include: typeof include }>;

const toItem = (r: Row): RoleListItem => ({
  id: r.id,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  isSalesRole: r.isSalesRole,
  permissions: r.permissions.map((p) => p.permission.code),
  userCount: r._count.users,
  version: r.version,
});

@Injectable()
export class PrismaRolesRepository implements RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async permissionIds(codes: string[]): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    if (permissions.length !== codes.length) {
      const found = new Set(permissions.map((p) => p.code));
      const missing = codes.filter((c) => !found.has(c));
      throw new ValidationError(`Unknown permissions: ${missing.join(', ')}`);
    }
    return permissions.map((p) => p.id);
  }

  async list(query: PaginationQuery): Promise<Paginated<RoleListItem>> {
    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        include,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.role.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async listAll(): Promise<RoleListItem[]> {
    const rows = await this.prisma.role.findMany({
      where: { deletedAt: null },
      include,
      orderBy: { name: 'asc' },
    });
    return rows.map(toItem);
  }

  async findById(id: UUID): Promise<RoleListItem | null> {
    const row = await this.prisma.role.findFirst({ where: { id, deletedAt: null }, include });
    return row ? toItem(row) : null;
  }

  async nameExists(name: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.role.findFirst({
      where: { name, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  async create(data: CreateRoleData): Promise<RoleListItem> {
    const permissionIds = await this.permissionIds(data.permissionCodes);
    const row = await this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        isSystem: false,
        isSalesRole: data.isSalesRole,
        createdBy: data.createdBy,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include,
    });
    return toItem(row);
  }

  async update(id: UUID, data: UpdateRoleData): Promise<RoleListItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.role.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Role not found');
      if (existing.isSystem && data.name !== undefined && data.name !== existing.name) {
        throw new ValidationError('System roles cannot be renamed');
      }
      const updated = await tx.role.updateMany({
        where: { id, deletedAt: null, version: data.version },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.isSalesRole !== undefined ? { isSalesRole: data.isSalesRole } : {}),
          updatedBy: data.updatedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Role was modified by someone else. Reload and retry.');
      }
      if (data.permissionCodes) {
        const permissionIds = await this.permissionIds(data.permissionCodes);
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
      return tx.role.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) throw new NotFoundError('Role not found');
    if (existing.isSystem) throw new ValidationError('System roles cannot be deleted');
    if (existing._count.users > 0) {
      throw new ValidationError('Role is assigned to users. Unassign it first.');
    }
    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  async listPermissionCodes(): Promise<string[]> {
    const rows = await this.prisma.permission.findMany({
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => r.code);
  }
}
