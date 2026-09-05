import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  Paginated,
  PaginationQuery,
  PortalAccountItem,
  PortalMe,
  PortalParty,
  PortalPartyType,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  PortalAccountListFilter,
  PortalAccountRepository,
  ProvisionUserData,
} from '../domain/portal-account.repository';

const include = {
  user: { select: { email: true, firstName: true, lastName: true } },
  supplier: { select: { code: true, name: true } },
  customer: { select: { code: true, name: true } },
} satisfies Prisma.PortalAccountInclude;

type Row = Prisma.PortalAccountGetPayload<{ include: typeof include }>;

const partyNameOf = (row: Row): string | null =>
  row.partyType === 'SUPPLIER' ? (row.supplier?.name ?? null) : (row.customer?.name ?? null);

const toItem = (row: Row): PortalAccountItem => ({
  id: row.id,
  userId: row.userId,
  email: row.user.email,
  fullName: `${row.user.firstName} ${row.user.lastName}`.trim(),
  partyType: row.partyType,
  supplierId: row.supplierId,
  customerId: row.customerId,
  partyName: partyNameOf(row),
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
});

const splitName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? fullName.trim(), lastName: parts.slice(1).join(' ') };
};

@Injectable()
export class PrismaPortalAccountRepository implements PortalAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: PaginationQuery,
    filter: PortalAccountListFilter,
  ): Promise<Paginated<PortalAccountItem>> {
    const where: Prisma.PortalAccountWhereInput = {
      deletedAt: null,
      ...(filter.partyType ? { partyType: filter.partyType } : {}),
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.portalAccount.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.portalAccount.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async findById(id: UUID): Promise<PortalAccountItem | null> {
    const row = await this.prisma.portalAccount.findFirst({ where: { id, deletedAt: null }, include });
    return row ? toItem(row) : null;
  }

  async partyName(partyType: PortalPartyType, partyId: UUID): Promise<string | null> {
    if (partyType === 'SUPPLIER') {
      const s = await this.prisma.supplier.findFirst({
        where: { id: partyId, deletedAt: null },
        select: { name: true },
      });
      return s?.name ?? null;
    }
    const c = await this.prisma.customer.findFirst({
      where: { id: partyId, deletedAt: null },
      select: { name: true },
    });
    return c?.name ?? null;
  }

  async findUserIdByEmail(email: string): Promise<UUID | null> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async provisionUser(data: ProvisionUserData): Promise<UUID> {
    const role = await this.prisma.role.findFirst({
      where: { name: data.roleName, deletedAt: null },
      select: { id: true },
    });
    if (!role) throw new ValidationError(`System role ${data.roleName} is missing; seed roles first`);

    const { firstName, lastName } = splitName(data.fullName);
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        firstName,
        lastName,
        isActive: true,
        createdBy: data.createdBy,
        roles: { create: [{ roleId: role.id }] },
      },
      select: { id: true },
    });
    return user.id;
  }

  async linkExists(userId: UUID, partyType: PortalPartyType, partyId: UUID): Promise<boolean> {
    const row = await this.prisma.portalAccount.findFirst({
      where: {
        userId,
        deletedAt: null,
        ...(partyType === 'SUPPLIER' ? { supplierId: partyId } : { customerId: partyId }),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async createAccount(
    userId: UUID,
    partyType: PortalPartyType,
    partyId: UUID,
    createdBy: UUID,
  ): Promise<PortalAccountItem> {
    const row = await this.prisma.portalAccount.create({
      data: {
        userId,
        partyType,
        supplierId: partyType === 'SUPPLIER' ? partyId : null,
        customerId: partyType === 'CUSTOMER' ? partyId : null,
        createdBy,
      },
      include,
    });
    return toItem(row);
  }

  async setActive(id: UUID, isActive: boolean, actorId: UUID): Promise<PortalAccountItem> {
    const res = await this.prisma.portalAccount.updateMany({
      where: { id, deletedAt: null },
      data: { isActive, updatedBy: actorId, version: { increment: 1 } },
    });
    if (res.count === 0) throw new NotFoundError('Portal account not found');
    const row = await this.prisma.portalAccount.findFirstOrThrow({ where: { id }, include });
    return toItem(row);
  }

  async softDelete(id: UUID, actorId: UUID): Promise<void> {
    const res = await this.prisma.portalAccount.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: actorId, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Portal account not found');
  }

  async partiesForUser(userId: UUID): Promise<PortalMe> {
    const rows = await this.prisma.portalAccount.findMany({
      where: { userId, isActive: true, deletedAt: null },
      include,
      orderBy: { createdAt: 'asc' },
    });
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    const suppliers: PortalParty[] = [];
    const customers: PortalParty[] = [];
    for (const row of rows) {
      if (row.partyType === 'SUPPLIER' && row.supplier && row.supplierId) {
        suppliers.push({
          accountId: row.id,
          partyType: 'SUPPLIER',
          partyId: row.supplierId,
          code: row.supplier.code,
          name: row.supplier.name,
        });
      } else if (row.partyType === 'CUSTOMER' && row.customer && row.customerId) {
        customers.push({
          accountId: row.id,
          partyType: 'CUSTOMER',
          partyId: row.customerId,
          code: row.customer.code,
          name: row.customer.name,
        });
      }
    }
    return {
      userId,
      email: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      suppliers,
      customers,
    };
  }

  async hasSupplierAccess(userId: UUID, supplierId: UUID): Promise<boolean> {
    const row = await this.prisma.portalAccount.findFirst({
      where: { userId, supplierId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }
}
