import { Injectable } from '@nestjs/common';
import type { Customer, Prisma, Supplier } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError } from '@tiles-erp/shared';
import type { Paginated, PaginationQuery, PartyItem, UUID } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CreatePartyData,
  PartyListFilter,
  PartyRepository,
  UpdatePartyData,
} from '../domain/party.repository';

const contactFrom = (row: Customer | Supplier): Omit<PartyItem, 'id' | 'code' | 'name' | 'gstin' | 'panNumber' | 'openingBalance' | 'isActive' | 'notes' | 'type' | 'creditDays' | 'creditLimit' | 'paymentTermDays' | 'version'> => ({
  contactPerson: row.contactPerson,
  phone: row.phone,
  altPhone: row.altPhone,
  email: row.email,
  addressLine1: row.addressLine1,
  addressLine2: row.addressLine2,
  city: row.city,
  state: row.state,
  stateCode: row.stateCode,
  pincode: row.pincode,
});

const customerToItem = (row: Customer): PartyItem => ({
  id: row.id,
  code: row.code,
  name: row.name,
  gstin: row.gstin,
  panNumber: row.panNumber,
  openingBalance: Number(row.openingBalance),
  isActive: row.isActive,
  notes: row.notes,
  type: row.type,
  creditDays: row.creditDays,
  creditLimit: Number(row.creditLimit),
  paymentTermDays: null,
  version: row.version,
  ...contactFrom(row),
});

const supplierToItem = (row: Supplier): PartyItem => ({
  id: row.id,
  code: row.code,
  name: row.name,
  gstin: row.gstin,
  panNumber: row.panNumber,
  openingBalance: Number(row.openingBalance),
  isActive: row.isActive,
  notes: row.notes,
  type: null,
  creditDays: null,
  creditLimit: null,
  paymentTermDays: row.paymentTermDays,
  version: row.version,
  ...contactFrom(row),
});

/** Fields common to both masters, filtered to those actually supplied. */
const writableFields = (data: object, keys: string[]): Record<string, unknown> => {
  const source = data as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
};

const CONTACT_KEYS = [
  'name',
  'gstin',
  'panNumber',
  'contactPerson',
  'phone',
  'altPhone',
  'email',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'stateCode',
  'pincode',
  'openingBalance',
  'notes',
  'isActive',
];

const buildSearch = (search?: string): Prisma.CustomerWhereInput =>
  search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { gstin: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

@Injectable()
export class PrismaCustomerRepository implements PartyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQuery, filter: PartyListFilter): Promise<Paginated<PartyItem>> {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(filter.stateCode ? { stateCode: filter.stateCode } : {}),
      ...buildSearch(query.search),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return buildPaginated(rows.map(customerToItem), query.page, query.pageSize, total);
  }

  async findById(id: UUID): Promise<PartyItem | null> {
    const row = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    return row ? customerToItem(row) : null;
  }

  async codeExists(code: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.customer.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async findByPhone(phone: string, excludeId?: UUID): Promise<PartyItem | null> {
    const row = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    return row ? customerToItem(row) : null;
  }

  async nextCode(): Promise<string> {
    const count = await this.prisma.customer.count();
    return `CUST-${String(count + 1).padStart(6, '0')}`;
  }

  async create(data: CreatePartyData): Promise<PartyItem> {
    const row = await this.prisma.customer.create({
      data: {
        code: data.code,
        name: data.name,
        ...writableFields(data, CONTACT_KEYS),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.creditDays !== undefined ? { creditDays: data.creditDays } : {}),
        ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}),
        createdBy: data.createdBy,
      } as Prisma.CustomerUncheckedCreateInput,
    });
    return customerToItem(row);
  }

  async update(id: UUID, data: UpdatePartyData): Promise<PartyItem> {
    const updated = await this.prisma.customer.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...writableFields(data, CONTACT_KEYS),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.creditDays !== undefined ? { creditDays: data.creditDays } : {}),
        ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      } as Prisma.CustomerUncheckedUpdateManyInput,
    });
    if (updated.count === 0) {
      const exists = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Customer not found');
      throw new ConflictError('Customer was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.customer.findFirstOrThrow({ where: { id } });
    return customerToItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.customer.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Customer not found');
  }
}

@Injectable()
export class PrismaSupplierRepository implements PartyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQuery, filter: PartyListFilter): Promise<Paginated<PartyItem>> {
    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(filter.stateCode ? { stateCode: filter.stateCode } : {}),
      ...(buildSearch(query.search) as Prisma.SupplierWhereInput),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return buildPaginated(rows.map(supplierToItem), query.page, query.pageSize, total);
  }

  async findById(id: UUID): Promise<PartyItem | null> {
    const row = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    return row ? supplierToItem(row) : null;
  }

  async codeExists(code: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.supplier.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async findByPhone(phone: string, excludeId?: UUID): Promise<PartyItem | null> {
    const row = await this.prisma.supplier.findFirst({
      where: { phone, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    return row ? supplierToItem(row) : null;
  }

  async nextCode(): Promise<string> {
    const count = await this.prisma.supplier.count();
    return `SUPP-${String(count + 1).padStart(6, '0')}`;
  }

  async create(data: CreatePartyData): Promise<PartyItem> {
    const row = await this.prisma.supplier.create({
      data: {
        code: data.code,
        name: data.name,
        ...writableFields(data, CONTACT_KEYS),
        ...(data.paymentTermDays !== undefined ? { paymentTermDays: data.paymentTermDays } : {}),
        createdBy: data.createdBy,
      } as Prisma.SupplierUncheckedCreateInput,
    });
    return supplierToItem(row);
  }

  async update(id: UUID, data: UpdatePartyData): Promise<PartyItem> {
    const updated = await this.prisma.supplier.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...writableFields(data, CONTACT_KEYS),
        ...(data.paymentTermDays !== undefined ? { paymentTermDays: data.paymentTermDays } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      } as Prisma.SupplierUncheckedUpdateManyInput,
    });
    if (updated.count === 0) {
      const exists = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Supplier not found');
      throw new ConflictError('Supplier was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.supplier.findFirstOrThrow({ where: { id } });
    return supplierToItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.supplier.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Supplier not found');
  }
}
