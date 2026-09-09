import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError } from '@tiles-erp/shared';
import type {
  Paginated,
  PaginationQuery,
  SalesmanItem,
  UserListItem,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { CreateUserData, UpdateUserData, UsersRepository } from '../domain/users.repository';

const include = {
  roles: { include: { role: { select: { id: true, name: true } } } },
  branches: { include: { branch: { select: { id: true, name: true } } } },
  departments: { include: { department: { select: { id: true, name: true } } } },
} satisfies Prisma.UserInclude;

type Row = Prisma.UserGetPayload<{ include: typeof include }>;

const toItem = (u: Row): UserListItem => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  isActive: u.isActive,
  roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
  branches: u.branches.map((b) => ({ id: b.branch.id, name: b.branch.name })),
  departments: u.departments.map((d) => ({ id: d.department.id, name: d.department.name })),
  createdAt: u.createdAt.toISOString(),
  version: u.version,
});

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQuery): Promise<Paginated<UserListItem>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      // Maintenance accounts are deliberately absent from this list. They belong to
      // whoever runs the system, not to the business using it, and an admin tidying
      // up should never be in a position to delete one by mistake.
      isHidden: false,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput =
      query.sortBy === 'email' || query.sortBy === 'firstName' || query.sortBy === 'createdAt'
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async listSalesmen(): Promise<SalesmanItem[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        // A maintenance login is not a salesman, and must not be selectable as one on
        // a quotation or an order.
        isHidden: false,
        roles: { some: { role: { isSalesRole: true, deletedAt: null } } },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
      email: row.email,
    }));
  }

  async findById(id: UUID): Promise<UserListItem | null> {
    const row = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include });
    return row ? toItem(row) : null;
  }

  async emailExists(email: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  async create(data: CreateUserData): Promise<UserListItem> {
    const row = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        isActive: data.isActive,
        createdBy: data.createdBy,
        roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
        branches: { create: data.branchIds.map((branchId) => ({ branchId })) },
        departments: { create: data.departmentIds.map((departmentId) => ({ departmentId })) },
      },
      include,
    });
    return toItem(row);
  }

  async update(id: UUID, data: UpdateUserData): Promise<UserListItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id, deletedAt: null, version: data.version },
        data: {
          ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
          ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
          updatedBy: data.updatedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        const exists = await tx.user.findFirst({ where: { id, deletedAt: null } });
        if (!exists) throw new NotFoundError('User not found');
        throw new ConflictError('User was modified by someone else. Reload and retry.');
      }
      if (data.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: data.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      if (data.branchIds) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        await tx.userBranch.createMany({
          data: data.branchIds.map((branchId) => ({ userId: id, branchId })),
        });
      }
      if (data.departmentIds) {
        await tx.userDepartment.deleteMany({ where: { userId: id } });
        await tx.userDepartment.createMany({
          data: data.departmentIds.map((departmentId) => ({ userId: id, departmentId })),
        });
      }
      return tx.user.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.user.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('User not found');
  }
}
