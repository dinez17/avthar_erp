import { Injectable } from '@nestjs/common';
import type { Campaign, Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError } from '@tiles-erp/shared';
import type {
  CampaignItem,
  LeadStage,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CampaignListFilter,
  CampaignPerformanceAggregate,
  CampaignRepository,
  CreateCampaignData,
  UpdateCampaignData,
} from '../domain/campaign.repository';

const toItem = (row: Campaign): CampaignItem => ({
  id: row.id,
  code: row.code,
  name: row.name,
  channel: row.channel,
  status: row.status,
  budget: Number(row.budget),
  startDate: row.startDate ? row.startDate.toISOString() : null,
  endDate: row.endDate ? row.endDate.toISOString() : null,
  objective: row.objective,
  notes: row.notes,
  version: row.version,
});

const dateValue = (value: string | null | undefined): Date | null | undefined => {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
};

const buildSearch = (search?: string): Prisma.CampaignWhereInput =>
  search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { objective: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

@Injectable()
export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQuery, filter: CampaignListFilter): Promise<Paginated<CampaignItem>> {
    const where: Prisma.CampaignWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.channel ? { channel: filter.channel } : {}),
      ...buildSearch(query.search),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async findById(id: UUID): Promise<CampaignItem | null> {
    const row = await this.prisma.campaign.findFirst({ where: { id, deletedAt: null } });
    return row ? toItem(row) : null;
  }

  async codeExists(code: string, excludeId?: UUID): Promise<boolean> {
    const row = await this.prisma.campaign.findFirst({
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
    const count = await this.prisma.campaign.count();
    return `CAMP-${String(count + 1).padStart(6, '0')}`;
  }

  async exists(id: UUID): Promise<boolean> {
    const row = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  async create(data: CreateCampaignData): Promise<CampaignItem> {
    const row = await this.prisma.campaign.create({
      data: {
        code: data.code,
        name: data.name,
        channel: data.channel,
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.budget !== undefined ? { budget: data.budget } : {}),
        startDate: dateValue(data.startDate) ?? null,
        endDate: dateValue(data.endDate) ?? null,
        objective: data.objective ?? null,
        notes: data.notes ?? null,
        createdBy: data.createdBy,
      },
    });
    return toItem(row);
  }

  async update(id: UUID, data: UpdateCampaignData): Promise<CampaignItem> {
    const updated = await this.prisma.campaign.updateMany({
      where: { id, deletedAt: null, version: data.version },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.channel !== undefined ? { channel: data.channel } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.budget !== undefined ? { budget: data.budget } : {}),
        ...(data.startDate !== undefined ? { startDate: dateValue(data.startDate) } : {}),
        ...(data.endDate !== undefined ? { endDate: dateValue(data.endDate) } : {}),
        ...(data.objective !== undefined ? { objective: data.objective } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        updatedBy: data.updatedBy,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.campaign.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Campaign not found');
      throw new ConflictError('Campaign was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.campaign.findFirstOrThrow({ where: { id } });
    return toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.campaign.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy },
    });
    if (res.count === 0) throw new NotFoundError('Campaign not found');
  }

  async performanceAggregates(): Promise<CampaignPerformanceAggregate[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const grouped = await this.prisma.lead.groupBy({
      by: ['campaignId', 'stage'],
      where: { deletedAt: null, campaignId: { not: null } },
      _count: { _all: true },
      _sum: { expectedValue: true },
    });

    // Fold the per-stage groups into one accumulator per campaign.
    const acc = new Map<
      string,
      Omit<CampaignPerformanceAggregate, 'campaignId' | 'code' | 'name' | 'channel' | 'status' | 'budget'>
    >();
    const blank = () => ({
      leadsCount: 0,
      convertedCount: 0,
      notInterestedCount: 0,
      openCount: 0,
      pipelineValue: 0,
      convertedValue: 0,
    });

    for (const g of grouped) {
      if (!g.campaignId) continue;
      const stage = g.stage as LeadStage;
      const count = g._count._all;
      const value = g._sum.expectedValue ? Number(g._sum.expectedValue) : 0;
      const row = acc.get(g.campaignId) ?? blank();
      row.leadsCount += count;
      row.pipelineValue += value;
      if (stage === 'CONVERTED') {
        row.convertedCount += count;
        row.convertedValue += value;
      } else if (stage === 'NOT_INTERESTED') {
        row.notInterestedCount += count;
      } else {
        row.openCount += count;
      }
      acc.set(g.campaignId, row);
    }

    return campaigns.map((c) => ({
      campaignId: c.id,
      code: c.code,
      name: c.name,
      channel: c.channel,
      status: c.status,
      budget: Number(c.budget),
      ...(acc.get(c.id) ?? blank()),
    }));
  }
}
