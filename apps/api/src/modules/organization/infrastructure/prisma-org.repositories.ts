import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { OrgNodeItem, Paginated, PaginationQuery, UUID } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  BulkCreateOrgNodeData,
  CreateOrgNodeData,
  OrgNodeBulkRepository,
  OrgNodeRepository,
  UpdateOrgNodeData,
} from '../domain/org-node.repository';

const searchFilter = (search?: string): Prisma.StringFilter | undefined =>
  search ? { contains: search, mode: 'insensitive' } : undefined;

const pageArgs = (q: PaginationQuery): { skip: number; take: number } => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});

/** Company: hierarchy root — no parent, no code; blocks delete while branches exist. */
@Injectable()
export class PrismaCompanyRepository implements OrgNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQuery): Promise<Paginated<OrgNodeItem>> {
    const where: Prisma.CompanyWhereInput = { deletedAt: null, name: searchFilter(query.search) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        include: { _count: { select: { branches: { where: { deletedAt: null } } } } },
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.company.count({ where }),
    ]);
    return buildPaginated(
      rows.map((c) => ({
        id: c.id,
        name: c.name,
        code: null,
        legalName: c.legalName,
        gstin: c.gstin,
        addressLine1: c.addressLine1,
        addressLine2: c.addressLine2,
        city: c.city,
        state: c.state,
      stateCode: c.stateCode,
        pincode: c.pincode,
        phone: c.phone,
        email: c.email,
        isActive: c.isActive,
        parentId: null,
        parentName: null,
        childCount: c._count.branches,
        version: c.version,
      })),
      query.page,
      query.pageSize,
      total,
    );
  }

  async create(data: CreateOrgNodeData): Promise<OrgNodeItem> {
    const row = await this.prisma.company.create({
      data: {
        name: data.name,
        legalName: data.legalName,
        gstin: data.gstin,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        stateCode: data.stateCode,
        pincode: data.pincode,
        phone: data.phone,
        email: data.email,
        isActive: data.isActive,
        createdBy: data.createdBy,
      },
    });
    return {
      id: row.id,
      name: row.name,
      code: null,
      legalName: row.legalName,
      gstin: row.gstin,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      stateCode: row.stateCode,
      pincode: row.pincode,
      phone: row.phone,
      email: row.email,
      isActive: row.isActive,
      parentId: null,
      parentName: null,
      childCount: 0,
      version: row.version,
    };
  }

  async update(id: UUID, data: UpdateOrgNodeData): Promise<OrgNodeItem> {
    const updated = await this.prisma.company.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
        ...(data.gstin !== undefined ? { gstin: data.gstin } : {}),
        ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
        ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.state !== undefined ? { state: data.state } : {}),
        ...(data.stateCode !== undefined ? { stateCode: data.stateCode } : {}),
        ...(data.pincode !== undefined ? { pincode: data.pincode } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.company.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Company not found');
      throw new ConflictError('Company was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.company.findFirstOrThrow({
      where: { id },
      include: { _count: { select: { branches: { where: { deletedAt: null } } } } },
    });
    return {
      id: row.id,
      name: row.name,
      code: null,
      legalName: row.legalName,
      gstin: row.gstin,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      stateCode: row.stateCode,
      pincode: row.pincode,
      phone: row.phone,
      email: row.email,
      isActive: row.isActive,
      parentId: null,
      parentName: null,
      childCount: row._count.branches,
      version: row.version,
    };
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { branches: { where: { deletedAt: null } } } } },
    });
    if (!existing) throw new NotFoundError('Company not found');
    if (existing._count.branches > 0) {
      throw new ValidationError('Company has branches. Delete or move them first.');
    }
    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
  }
}

/** Branch: parent = Company, globally unique code, blocks delete while godowns exist. */
@Injectable()
export class PrismaBranchRepository implements OrgNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toItem(
    row: Prisma.BranchGetPayload<{
      include: {
        company: { select: { name: true } };
        _count: { select: { godowns: true } };
      };
    }>,
  ): OrgNodeItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      legalName: null,
      gstin: row.gstin,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      stateCode: row.stateCode,
      pincode: row.pincode,
      phone: row.phone,
      email: row.email,
      isActive: row.isActive,
      parentId: row.companyId,
      parentName: row.company.name,
      childCount: row._count.godowns,
      version: row.version,
    };
  }

  private readonly include = {
    company: { select: { name: true } },
    _count: { select: { godowns: { where: { deletedAt: null } } } },
  } as const;

  async list(query: PaginationQuery, parentId?: UUID): Promise<Paginated<OrgNodeItem>> {
    const where: Prisma.BranchWhereInput = {
      deletedAt: null,
      name: searchFilter(query.search),
      ...(parentId ? { companyId: parentId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        include: this.include,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.branch.count({ where }),
    ]);
    return buildPaginated(rows.map((r) => this.toItem(r)), query.page, query.pageSize, total);
  }

  async create(data: CreateOrgNodeData): Promise<OrgNodeItem> {
    const parent = await this.prisma.company.findFirst({
      where: { id: data.parentId ?? '', deletedAt: null },
    });
    if (!parent) throw new ValidationError('Parent company not found');
    const dup = await this.prisma.branch.findFirst({
      where: { code: data.code ?? '', deletedAt: null },
    });
    if (dup) throw new ConflictError(`Branch code "${data.code}" is already in use`);
    const row = await this.prisma.branch.create({
      data: {
        companyId: parent.id,
        name: data.name,
        code: data.code ?? '',
        gstin: data.gstin,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        stateCode: data.stateCode,
        pincode: data.pincode,
        phone: data.phone,
        email: data.email,
        isActive: data.isActive,
        createdBy: data.createdBy,
      },
      include: this.include,
    });
    return this.toItem(row);
  }

  async update(id: UUID, data: UpdateOrgNodeData): Promise<OrgNodeItem> {
    if (data.code !== undefined) {
      const dup = await this.prisma.branch.findFirst({
        where: { code: data.code, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError(`Branch code "${data.code}" is already in use`);
    }
    const updated = await this.prisma.branch.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.gstin !== undefined ? { gstin: data.gstin } : {}),
        ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
        ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.state !== undefined ? { state: data.state } : {}),
        ...(data.stateCode !== undefined ? { stateCode: data.stateCode } : {}),
        ...(data.pincode !== undefined ? { pincode: data.pincode } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.branch.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Branch not found');
      throw new ConflictError('Branch was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.branch.findFirstOrThrow({ where: { id }, include: this.include });
    return this.toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { godowns: { where: { deletedAt: null } } } } },
    });
    if (!existing) throw new NotFoundError('Branch not found');
    if (existing._count.godowns > 0) {
      throw new ValidationError('Branch has godowns. Delete or move them first.');
    }
    await this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
  }
}

/** Godown: parent = Branch, code unique per branch, blocks delete while gates exist. */
@Injectable()
export class PrismaGodownRepository implements OrgNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    branch: { select: { name: true } },
    _count: { select: { gates: { where: { deletedAt: null } } } },
  } as const;

  private toItem(
    row: Prisma.GodownGetPayload<{
      include: { branch: { select: { name: true } }; _count: { select: { gates: true } } };
    }>,
  ): OrgNodeItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      legalName: null,
      gstin: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      stateCode: null,
      pincode: null,
      phone: null,
      email: null,
      isActive: row.isActive,
      parentId: row.branchId,
      parentName: row.branch.name,
      childCount: row._count.gates,
      version: row.version,
    };
  }

  async list(query: PaginationQuery, parentId?: UUID): Promise<Paginated<OrgNodeItem>> {
    const where: Prisma.GodownWhereInput = {
      deletedAt: null,
      name: searchFilter(query.search),
      ...(parentId ? { branchId: parentId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.godown.findMany({
        where,
        include: this.include,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.godown.count({ where }),
    ]);
    return buildPaginated(rows.map((r) => this.toItem(r)), query.page, query.pageSize, total);
  }

  async create(data: CreateOrgNodeData): Promise<OrgNodeItem> {
    const parent = await this.prisma.branch.findFirst({
      where: { id: data.parentId ?? '', deletedAt: null },
    });
    if (!parent) throw new ValidationError('Parent branch not found');
    const dup = await this.prisma.godown.findFirst({
      where: { branchId: parent.id, code: data.code ?? '', deletedAt: null },
    });
    if (dup) throw new ConflictError(`Godown code "${data.code}" already exists in this branch`);
    const row = await this.prisma.godown.create({
      data: {
        branchId: parent.id,
        name: data.name,
        code: data.code ?? '',
        isActive: data.isActive,
        createdBy: data.createdBy,
      },
      include: this.include,
    });
    return this.toItem(row);
  }

  async update(id: UUID, data: UpdateOrgNodeData): Promise<OrgNodeItem> {
    if (data.code !== undefined) {
      const current = await this.prisma.godown.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundError('Godown not found');
      const dup = await this.prisma.godown.findFirst({
        where: { branchId: current.branchId, code: data.code, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError(`Godown code "${data.code}" already exists in this branch`);
    }
    const updated = await this.prisma.godown.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.godown.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Godown not found');
      throw new ConflictError('Godown was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.godown.findFirstOrThrow({ where: { id }, include: this.include });
    return this.toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.godown.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { gates: { where: { deletedAt: null } } } } },
    });
    if (!existing) throw new NotFoundError('Godown not found');
    if (existing._count.gates > 0) {
      throw new ValidationError('Godown has gates. Delete or move them first.');
    }
    await this.prisma.godown.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
  }
}

/** Gate: parent = Godown, code unique per godown, blocks delete while racks exist. */
@Injectable()
export class PrismaGateRepository implements OrgNodeBulkRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    godown: { select: { name: true } },
    _count: { select: { racks: { where: { deletedAt: null } } } },
  } as const;

  private toItem(
    row: Prisma.GateGetPayload<{
      include: { godown: { select: { name: true } }; _count: { select: { racks: true } } };
    }>,
  ): OrgNodeItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      legalName: null,
      gstin: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      stateCode: null,
      pincode: null,
      phone: null,
      email: null,
      isActive: row.isActive,
      parentId: row.godownId,
      parentName: row.godown.name,
      childCount: row._count.racks,
      version: row.version,
    };
  }

  async list(query: PaginationQuery, parentId?: UUID): Promise<Paginated<OrgNodeItem>> {
    const where: Prisma.GateWhereInput = {
      deletedAt: null,
      name: searchFilter(query.search),
      ...(parentId ? { godownId: parentId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.gate.findMany({
        where,
        include: this.include,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.gate.count({ where }),
    ]);
    return buildPaginated(rows.map((r) => this.toItem(r)), query.page, query.pageSize, total);
  }

  async create(data: CreateOrgNodeData): Promise<OrgNodeItem> {
    const parent = await this.prisma.godown.findFirst({
      where: { id: data.parentId ?? '', deletedAt: null },
    });
    if (!parent) throw new ValidationError('Parent godown not found');
    const dup = await this.prisma.gate.findFirst({
      where: { godownId: parent.id, code: data.code ?? '', deletedAt: null },
    });
    if (dup) throw new ConflictError(`Gate code "${data.code}" already exists in this godown`);
    const row = await this.prisma.gate.create({
      data: {
        godownId: parent.id,
        name: data.name,
        code: data.code ?? '',
        isActive: data.isActive,
        createdBy: data.createdBy,
      },
      include: this.include,
    });
    return this.toItem(row);
  }

  async update(id: UUID, data: UpdateOrgNodeData): Promise<OrgNodeItem> {
    if (data.code !== undefined) {
      const current = await this.prisma.gate.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundError('Gate not found');
      const dup = await this.prisma.gate.findFirst({
        where: { godownId: current.godownId, code: data.code, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError(`Gate code "${data.code}" already exists in this godown`);
    }
    const updated = await this.prisma.gate.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.gate.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Gate not found');
      throw new ConflictError('Gate was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.gate.findFirstOrThrow({ where: { id }, include: this.include });
    return this.toItem(row);
  }


  async bulkCreate(data: BulkCreateOrgNodeData): Promise<OrgNodeItem[]> {
    const parent = await this.prisma.godown.findFirst({
      where: { id: data.parentId, deletedAt: null },
    });
    if (!parent) throw new ValidationError('Parent godown not found');

    const codes = data.items.map((item) => item.code);
    const existing = await this.prisma.gate.findMany({
      where: { godownId: parent.id, code: { in: codes }, deletedAt: null },
      select: { code: true },
    });
    if (existing.length > 0) {
      throw new ConflictError(
        `Gate codes already in use in this godown: ${existing.map((e) => e.code).join(', ')}`,
      );
    }

    await this.prisma.gate.createMany({
      data: data.items.map((item) => ({
        godownId: parent.id,
        name: item.name,
        code: item.code,
        isActive: data.isActive,
        createdBy: data.createdBy,
      })),
    });
    const rows = await this.prisma.gate.findMany({
      where: { godownId: parent.id, code: { in: codes }, deletedAt: null },
      include: this.include,
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => this.toItem(r));
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.gate.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { racks: { where: { deletedAt: null } } } } },
    });
    if (!existing) throw new NotFoundError('Gate not found');
    if (existing._count.racks > 0) {
      throw new ValidationError('Gate has racks. Delete or move them first.');
    }
    await this.prisma.gate.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, isActive: false },
    });
  }
}

/** Rack: parent = Gate, code unique per gate, leaf level. */
@Injectable()
export class PrismaRackRepository implements OrgNodeBulkRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = { gate: { select: { name: true } } } as const;

  private toItem(
    row: Prisma.RackGetPayload<{ include: { gate: { select: { name: true } } } }>,
  ): OrgNodeItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      legalName: null,
      gstin: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      stateCode: null,
      pincode: null,
      phone: null,
      email: null,
      isActive: row.isActive,
      parentId: row.gateId,
      parentName: row.gate.name,
      childCount: 0,
      version: row.version,
    };
  }

  async list(query: PaginationQuery, parentId?: UUID): Promise<Paginated<OrgNodeItem>> {
    const where: Prisma.RackWhereInput = {
      deletedAt: null,
      name: searchFilter(query.search),
      ...(parentId ? { gateId: parentId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rack.findMany({
        where,
        include: this.include,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.rack.count({ where }),
    ]);
    return buildPaginated(rows.map((r) => this.toItem(r)), query.page, query.pageSize, total);
  }

  async create(data: CreateOrgNodeData): Promise<OrgNodeItem> {
    const parent = await this.prisma.gate.findFirst({
      where: { id: data.parentId ?? '', deletedAt: null },
    });
    if (!parent) throw new ValidationError('Parent gate not found');
    const dup = await this.prisma.rack.findFirst({
      where: { gateId: parent.id, code: data.code ?? '', deletedAt: null },
    });
    if (dup) throw new ConflictError(`Rack code "${data.code}" already exists in this gate`);
    const row = await this.prisma.rack.create({
      data: {
        gateId: parent.id,
        name: data.name,
        code: data.code ?? '',
        isActive: data.isActive,
      },
      include: this.include,
    });
    return this.toItem(row);
  }

  async update(id: UUID, data: UpdateOrgNodeData): Promise<OrgNodeItem> {
    if (data.code !== undefined) {
      const current = await this.prisma.rack.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundError('Rack not found');
      const dup = await this.prisma.rack.findFirst({
        where: { gateId: current.gateId, code: data.code, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictError(`Rack code "${data.code}" already exists in this gate`);
    }
    const updated = await this.prisma.rack.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.rack.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Rack not found');
      throw new ConflictError('Rack was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.rack.findFirstOrThrow({ where: { id }, include: this.include });
    return this.toItem(row);
  }


  async bulkCreate(data: BulkCreateOrgNodeData): Promise<OrgNodeItem[]> {
    const parent = await this.prisma.gate.findFirst({
      where: { id: data.parentId, deletedAt: null },
    });
    if (!parent) throw new ValidationError('Parent gate not found');

    const codes = data.items.map((item) => item.code);
    const existing = await this.prisma.rack.findMany({
      where: { gateId: parent.id, code: { in: codes }, deletedAt: null },
      select: { code: true },
    });
    if (existing.length > 0) {
      throw new ConflictError(
        `Rack codes already in use in this gate: ${existing.map((e) => e.code).join(', ')}`,
      );
    }

    await this.prisma.rack.createMany({
      data: data.items.map((item) => ({
        gateId: parent.id,
        name: item.name,
        code: item.code,
        isActive: data.isActive,
      })),
    });
    const rows = await this.prisma.rack.findMany({
      where: { gateId: parent.id, code: { in: codes }, deletedAt: null },
      include: this.include,
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => this.toItem(r));
  }

  async softDelete(id: UUID): Promise<void> {
    const res = await this.prisma.rack.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (res.count === 0) throw new NotFoundError('Rack not found');
  }
}
