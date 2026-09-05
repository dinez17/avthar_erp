import { Injectable } from '@nestjs/common';
import type { Lead, Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  ChangeLeadStageInput,
  LeadItem,
  LeadStage,
  LeadStageSummary,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CreateLeadData,
  LeadListFilter,
  LeadRepository,
  UpdateLeadData,
} from '../domain/lead.repository';

const ALL_STAGES: LeadStage[] = ['NEW', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED'];

/** CONVERTED and NOT_INTERESTED are settled; NEW and FOLLOW_UP are still being worked. */
const isOpen = (stage: LeadStage): boolean =>
  stage !== 'CONVERTED' && stage !== 'NOT_INTERESTED';

/** A lead row with the slim campaign snapshot the read model carries. */
type LeadRow = Lead & { campaign: { name: string } | null };

const toItem = (row: LeadRow): LeadItem => {
  const open = isOpen(row.stage);
  const followUpOverdue =
    open && row.nextFollowUpAt !== null && row.nextFollowUpAt.getTime() < Date.now();
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    companyName: row.companyName,
    phone: row.phone,
    altPhone: row.altPhone,
    email: row.email,
    city: row.city,
    source: row.source,
    stage: row.stage,
    ownerUserId: row.ownerUserId,
    ownerName: row.ownerName,
    expectedValue: Number(row.expectedValue),
    nextFollowUpAt: row.nextFollowUpAt ? row.nextFollowUpAt.toISOString() : null,
    customerId: row.customerId,
    branchId: row.branchId,
    campaignId: row.campaignId,
    campaignName: row.campaign?.name ?? null,
    convertedQuotationId: row.convertedQuotationId,
    convertedAt: row.convertedAt ? row.convertedAt.toISOString() : null,
    convertedByUserId: row.convertedByUserId,
    convertedByName: row.convertedByName,
    lostReason: row.lostReason,
    notes: row.notes,
    followUpOverdue,
    version: row.version,
  };
};

const buildSearch = (search?: string): Prisma.LeadWhereInput =>
  search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

/** Converts an ISO string (or null) into a Date only when the field was actually supplied. */
const followUpValue = (value: string | null | undefined): Date | null | undefined => {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
};

/** The attributed campaign's name travels with every lead read. */
const LEAD_INCLUDE = { campaign: { select: { name: true } } } as const;

@Injectable()
export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filter: LeadListFilter): Prisma.LeadWhereInput {
    return {
      deletedAt: null,
      ...(filter.stage ? { stage: filter.stage } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
      ...(filter.followUpDue
        ? {
            nextFollowUpAt: { lte: new Date() },
            stage: { notIn: ['CONVERTED', 'NOT_INTERESTED'] },
          }
        : {}),
    };
  }

  async list(query: PaginationQuery, filter: LeadListFilter): Promise<Paginated<LeadItem>> {
    const where: Prisma.LeadWhereInput = {
      ...this.buildWhere(filter),
      ...buildSearch(query.search),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: LEAD_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async findById(id: UUID): Promise<LeadItem | null> {
    const row = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      include: LEAD_INCLUDE,
    });
    return row ? toItem(row) : null;
  }

  async codeExists(code: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.lead.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async nextCode(): Promise<string> {
    const count = await this.prisma.lead.count();
    return `LEAD-${String(count + 1).padStart(6, '0')}`;
  }

  async pipeline(filter: LeadListFilter): Promise<LeadStageSummary[]> {
    const grouped = await this.prisma.lead.groupBy({
      by: ['stage'],
      where: this.buildWhere(filter),
      _count: { _all: true },
      _sum: { expectedValue: true },
    });
    const byStage = new Map(grouped.map((g) => [g.stage as LeadStage, g]));
    // Always return every column so the board renders empty stages too.
    return ALL_STAGES.map((stage) => {
      const row = byStage.get(stage);
      return {
        stage,
        count: row?._count._all ?? 0,
        expectedValue: row?._sum.expectedValue ? Number(row._sum.expectedValue) : 0,
      };
    });
  }

  async assertReferences(
    customerId: UUID | null,
    branchId: UUID | null,
    campaignId: UUID | null,
  ): Promise<void> {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) throw new ValidationError('Branch not found');
    }
    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true, isActive: true },
      });
      if (!customer) throw new ValidationError('Customer not found');
      if (!customer.isActive) throw new ValidationError('Customer is inactive');
    }
    if (campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: campaignId, deletedAt: null },
        select: { id: true },
      });
      if (!campaign) throw new ValidationError('Campaign not found');
    }
  }

  async ownerName(userId: UUID): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : null;
  }

  async create(data: CreateLeadData): Promise<LeadItem> {
    const row = await this.prisma.lead.create({
      data: {
        code: data.code,
        name: data.name,
        companyName: data.companyName ?? null,
        phone: data.phone ?? null,
        altPhone: data.altPhone ?? null,
        email: data.email ?? null,
        city: data.city ?? null,
        ...(data.source !== undefined ? { source: data.source } : {}),
        ...(data.stage !== undefined ? { stage: data.stage } : {}),
        ownerUserId: data.ownerUserId ?? null,
        ownerName: data.ownerName,
        ...(data.expectedValue !== undefined ? { expectedValue: data.expectedValue } : {}),
        nextFollowUpAt: followUpValue(data.nextFollowUpAt) ?? null,
        customerId: data.customerId ?? null,
        branchId: data.branchId ?? null,
        campaignId: data.campaignId ?? null,
        notes: data.notes ?? null,
        createdBy: data.createdBy,
      },
      include: LEAD_INCLUDE,
    });
    return toItem(row);
  }

  async update(id: UUID, data: UpdateLeadData): Promise<LeadItem> {
    const updated = await this.prisma.lead.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.altPhone !== undefined ? { altPhone: data.altPhone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.source !== undefined ? { source: data.source } : {}),
        ...(data.stage !== undefined ? { stage: data.stage } : {}),
        ...(data.ownerUserId !== undefined ? { ownerUserId: data.ownerUserId } : {}),
        ...(data.ownerName !== undefined ? { ownerName: data.ownerName } : {}),
        ...(data.expectedValue !== undefined ? { expectedValue: data.expectedValue } : {}),
        ...(data.nextFollowUpAt !== undefined
          ? { nextFollowUpAt: followUpValue(data.nextFollowUpAt) }
          : {}),
        ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
        ...(data.campaignId !== undefined ? { campaignId: data.campaignId } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Lead not found');
      throw new ConflictError('Lead was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.lead.findFirstOrThrow({ where: { id }, include: LEAD_INCLUDE });
    return toItem(row);
  }

  async changeStage(id: UUID, input: ChangeLeadStageInput, actorId: UUID): Promise<LeadItem> {
    const updated = await this.prisma.lead.updateMany({
      where: { id, deletedAt: null, version: input.version },
      data: {
        stage: input.stage,
        // Only a NOT_INTERESTED move keeps a reason; any other move clears a stale one.
        lostReason: input.stage === 'NOT_INTERESTED' ? (input.lostReason ?? null) : null,
        updatedBy: actorId,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Lead not found');
      throw new ConflictError('Lead was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.lead.findFirstOrThrow({ where: { id }, include: LEAD_INCLUDE });
    return toItem(row);
  }

  async markConverted(
    id: UUID,
    version: number,
    quotationId: UUID,
    actorId: UUID,
    convertedByName: string | null,
  ): Promise<LeadItem> {
    const updated = await this.prisma.lead.updateMany({
      where: { id, deletedAt: null, version },
      data: {
        stage: 'CONVERTED',
        convertedQuotationId: quotationId,
        convertedAt: new Date(),
        convertedByUserId: actorId,
        convertedByName,
        updatedBy: actorId,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Lead not found');
      throw new ConflictError('Lead was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.lead.findFirstOrThrow({ where: { id }, include: LEAD_INCLUDE });
    return toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.lead.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy },
    });
    if (res.count === 0) throw new NotFoundError('Lead not found');
  }
}
