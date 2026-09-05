import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CreateDriverInput,
  CreateTransporterInput,
  CreateVehicleInput,
  DriverItem,
  Paginated,
  PaginationQuery,
  TransporterItem,
  UpdateDriverInput,
  UpdateTransporterInput,
  UpdateVehicleInput,
  UUID,
  VehicleItem,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  DriverRepository,
  LogisticsListFilter,
  TransporterRepository,
  VehicleRepository,
} from '../domain/logistics.repositories';

const page = (q: PaginationQuery): { skip: number; take: number } => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});

/** Strips undefined entries so partial updates never clear untouched columns. */
const defined = <T extends object>(data: T, keys: (keyof T)[]): Record<string, unknown> =>
  Object.fromEntries(
    keys.filter((k) => data[k] !== undefined).map((k) => [k as string, data[k] as unknown]),
  );

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

// ---------------------------------------------------------------- Transporter

const transporterInclude = {
  _count: {
    select: {
      vehicles: { where: { deletedAt: null } },
      drivers: { where: { deletedAt: null } },
    },
  },
} as const;

type TransporterRow = Prisma.TransporterGetPayload<{ include: typeof transporterInclude }>;

const toTransporter = (row: TransporterRow): TransporterItem => ({
  id: row.id,
  code: row.code,
  name: row.name,
  gstin: row.gstin,
  contactPerson: row.contactPerson,
  phone: row.phone,
  email: row.email,
  addressLine1: row.addressLine1,
  city: row.city,
  state: row.state,
  stateCode: row.stateCode,
  pincode: row.pincode,
  vehicleCount: row._count.vehicles,
  driverCount: row._count.drivers,
  isActive: row.isActive,
  notes: row.notes,
  version: row.version,
});

const TRANSPORTER_KEYS = [
  'name',
  'gstin',
  'contactPerson',
  'phone',
  'email',
  'addressLine1',
  'city',
  'state',
  'stateCode',
  'pincode',
  'notes',
  'isActive',
] as const;

@Injectable()
export class PrismaTransporterRepository implements TransporterRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  async list(query: PaginationQuery): Promise<Paginated<TransporterItem>> {
    const where: Prisma.TransporterWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transporter.findMany({
        where,
        include: transporterInclude,
        orderBy: { name: 'asc' },
        ...page(query),
      }),
      this.prisma.transporter.count({ where }),
    ]);
    return buildPaginated(rows.map(toTransporter), query.page, query.pageSize, total);
  }

  async nextCode(): Promise<string> {
    return this.numbering.next(this.prisma, 'TRANSPORTER', null);
  }

  async codeExists(code: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.transporter.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async create(
    data: CreateTransporterInput & { code: string; createdBy: UUID },
  ): Promise<TransporterItem> {
    const row = await this.prisma.transporter.create({
      data: {
        code: data.code,
        name: data.name,
        ...defined(data, [...TRANSPORTER_KEYS]),
        createdBy: data.createdBy,
      } as Prisma.TransporterUncheckedCreateInput,
      include: transporterInclude,
    });
    return toTransporter(row);
  }

  async update(
    id: UUID,
    data: UpdateTransporterInput & { updatedBy: UUID },
  ): Promise<TransporterItem> {
    const updated = await this.prisma.transporter.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...defined(data, [...TRANSPORTER_KEYS]),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      } as Prisma.TransporterUncheckedUpdateManyInput,
    });
    if (updated.count === 0) {
      const exists = await this.prisma.transporter.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Transporter not found');
      throw new ConflictError('Transporter was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.transporter.findFirstOrThrow({
      where: { id },
      include: transporterInclude,
    });
    return toTransporter(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.transporter.findFirst({
      where: { id, deletedAt: null },
      include: transporterInclude,
    });
    if (!existing) throw new NotFoundError('Transporter not found');
    if (existing._count.vehicles + existing._count.drivers > 0) {
      throw new ValidationError('Transporter has vehicles or drivers. Reassign them first.');
    }
    await this.prisma.transporter.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
  }
}

// -------------------------------------------------------------------- Vehicle

const vehicleInclude = { transporter: { select: { name: true } } } as const;
type VehicleRow = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

const toVehicle = (row: VehicleRow): VehicleItem => ({
  id: row.id,
  number: row.number,
  type: row.type,
  ownership: row.ownership,
  transporterId: row.transporterId,
  transporterName: row.transporter?.name ?? null,
  capacityTons: row.capacityTons === null ? null : Number(row.capacityTons),
  make: row.make,
  insuranceExpiry: iso(row.insuranceExpiry),
  fitnessExpiry: iso(row.fitnessExpiry),
  isActive: row.isActive,
  notes: row.notes,
  version: row.version,
});

const VEHICLE_KEYS = [
  'type',
  'ownership',
  'transporterId',
  'capacityTons',
  'make',
  'notes',
  'isActive',
] as const;

@Injectable()
export class PrismaVehicleRepository implements VehicleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTransporter(transporterId?: UUID | null): Promise<void> {
    if (!transporterId) return;
    const found = await this.prisma.transporter.findFirst({
      where: { id: transporterId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new ValidationError('Transporter not found');
  }

  private dates(data: { insuranceExpiry?: string; fitnessExpiry?: string }): Record<string, Date> {
    const out: Record<string, Date> = {};
    if (data.insuranceExpiry) out.insuranceExpiry = new Date(data.insuranceExpiry);
    if (data.fitnessExpiry) out.fitnessExpiry = new Date(data.fitnessExpiry);
    return out;
  }

  async list(query: PaginationQuery, filter: LogisticsListFilter): Promise<Paginated<VehicleItem>> {
    const where: Prisma.VehicleWhereInput = {
      deletedAt: null,
      ...(filter.transporterId ? { transporterId: filter.transporterId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { make: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        include: vehicleInclude,
        orderBy: { number: 'asc' },
        ...page(query),
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return buildPaginated(rows.map(toVehicle), query.page, query.pageSize, total);
  }

  async numberExists(number: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.vehicle.findFirst({
      where: {
        number: { equals: number, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async create(data: CreateVehicleInput & { createdBy: UUID }): Promise<VehicleItem> {
    await this.assertTransporter(data.transporterId);
    const row = await this.prisma.vehicle.create({
      data: {
        number: data.number,
        ...defined(data, [...VEHICLE_KEYS]),
        ...this.dates(data),
        createdBy: data.createdBy,
      } as Prisma.VehicleUncheckedCreateInput,
      include: vehicleInclude,
    });
    return toVehicle(row);
  }

  async update(id: UUID, data: UpdateVehicleInput & { updatedBy: UUID }): Promise<VehicleItem> {
    await this.assertTransporter(data.transporterId);
    const updated = await this.prisma.vehicle.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.number !== undefined ? { number: data.number } : {}),
        ...defined(data, [...VEHICLE_KEYS]),
        ...this.dates(data),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      } as Prisma.VehicleUncheckedUpdateManyInput,
    });
    if (updated.count === 0) {
      const exists = await this.prisma.vehicle.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Vehicle not found');
      throw new ConflictError('Vehicle was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.vehicle.findFirstOrThrow({
      where: { id },
      include: vehicleInclude,
    });
    return toVehicle(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.vehicle.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Vehicle not found');
  }
}

// --------------------------------------------------------------------- Driver

const driverInclude = { transporter: { select: { name: true } } } as const;
type DriverRow = Prisma.DriverGetPayload<{ include: typeof driverInclude }>;

const toDriver = (row: DriverRow): DriverItem => ({
  id: row.id,
  code: row.code,
  name: row.name,
  phone: row.phone,
  altPhone: row.altPhone,
  licenseNumber: row.licenseNumber,
  licenseExpiry: iso(row.licenseExpiry),
  transporterId: row.transporterId,
  transporterName: row.transporter?.name ?? null,
  addressLine1: row.addressLine1,
  city: row.city,
  isActive: row.isActive,
  notes: row.notes,
  version: row.version,
});

const DRIVER_KEYS = [
  'name',
  'phone',
  'altPhone',
  'licenseNumber',
  'transporterId',
  'addressLine1',
  'city',
  'notes',
  'isActive',
] as const;

@Injectable()
export class PrismaDriverRepository implements DriverRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  private async assertTransporter(transporterId?: UUID | null): Promise<void> {
    if (!transporterId) return;
    const found = await this.prisma.transporter.findFirst({
      where: { id: transporterId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new ValidationError('Transporter not found');
  }

  async list(query: PaginationQuery, filter: LogisticsListFilter): Promise<Paginated<DriverItem>> {
    const where: Prisma.DriverWhereInput = {
      deletedAt: null,
      ...(filter.transporterId ? { transporterId: filter.transporterId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { licenseNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        where,
        include: driverInclude,
        orderBy: { name: 'asc' },
        ...page(query),
      }),
      this.prisma.driver.count({ where }),
    ]);
    return buildPaginated(rows.map(toDriver), query.page, query.pageSize, total);
  }

  async nextCode(): Promise<string> {
    return this.numbering.next(this.prisma, 'DRIVER', null);
  }

  async codeExists(code: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.driver.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async create(data: CreateDriverInput & { code: string; createdBy: UUID }): Promise<DriverItem> {
    await this.assertTransporter(data.transporterId);
    const row = await this.prisma.driver.create({
      data: {
        code: data.code,
        name: data.name,
        phone: data.phone,
        ...defined(data, [...DRIVER_KEYS]),
        ...(data.licenseExpiry ? { licenseExpiry: new Date(data.licenseExpiry) } : {}),
        createdBy: data.createdBy,
      } as Prisma.DriverUncheckedCreateInput,
      include: driverInclude,
    });
    return toDriver(row);
  }

  async update(id: UUID, data: UpdateDriverInput & { updatedBy: UUID }): Promise<DriverItem> {
    await this.assertTransporter(data.transporterId);
    const updated = await this.prisma.driver.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...defined(data, [...DRIVER_KEYS]),
        ...(data.licenseExpiry ? { licenseExpiry: new Date(data.licenseExpiry) } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      } as Prisma.DriverUncheckedUpdateManyInput,
    });
    if (updated.count === 0) {
      const exists = await this.prisma.driver.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Driver not found');
      throw new ConflictError('Driver was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.driver.findFirstOrThrow({
      where: { id },
      include: driverInclude,
    });
    return toDriver(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.driver.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Driver not found');
  }
}
