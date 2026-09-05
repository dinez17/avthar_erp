import { Injectable } from '@nestjs/common';
import type { Prisma, SalesVisit } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError } from '@tiles-erp/shared';
import type {
  LeadStage,
  Paginated,
  PaginationQuery,
  SalesVisitItem,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CreateSalesVisitData,
  LeadVisitSideEffect,
  SalesVisitListFilter,
  SalesVisitRepository,
  UpdateSalesVisitData,
} from '../domain/sales-visit.repository';

type Row = SalesVisit & { lead: { code: string; name: string } | null };

const toItem = (row: Row): SalesVisitItem => ({
  id: row.id,
  leadId: row.leadId,
  leadCode: row.lead?.code ?? null,
  leadName: row.lead?.name ?? null,
  salespersonUserId: row.salespersonUserId,
  salespersonName: row.salespersonName,
  purpose: row.purpose,
  status: row.status,
  outcome: row.outcome,
  scheduledAt: row.scheduledAt.toISOString(),
  completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  location: row.location,
  notes: row.notes,
  nextFollowUpAt: row.nextFollowUpAt ? row.nextFollowUpAt.toISOString() : null,
  overdue: row.status === 'PLANNED' && row.scheduledAt.getTime() < Date.now(),
  version: row.version,
});

const leadSelect = { select: { code: true, name: true } } as const;

const dateValue = (value: string | null | undefined): Date | null | undefined => {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
};

/** Applies a lead side effect inside a transaction, shared by create and update. */
const applySideEffect = (
  tx: Prisma.TransactionClient,
  leadId: UUID,
  sideEffect: LeadVisitSideEffect,
  actorId: UUID,
): Promise<unknown> =>
  tx.lead.updateMany({
    where: { id: leadId, deletedAt: null },
    data: {
      ...(sideEffect.stage !== undefined ? { stage: sideEffect.stage } : {}),
      ...(sideEffect.nextFollowUpAt !== undefined
        ? { nextFollowUpAt: sideEffect.nextFollowUpAt }
        : {}),
      ...(sideEffect.lostReason !== undefined ? { lostReason: sideEffect.lostReason } : {}),
      updatedBy: actorId,
      version: { increment: 1 },
    },
  });

@Injectable()
export class PrismaSalesVisitRepository implements SalesVisitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: PaginationQuery,
    filter: SalesVisitListFilter,
  ): Promise<Paginated<SalesVisitItem>> {
    const where: Prisma.SalesVisitWhereInput = {
      deletedAt: null,
      ...(filter.leadId ? { leadId: filter.leadId } : {}),
      ...(filter.salespersonUserId ? { salespersonUserId: filter.salespersonUserId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.overdue ? { status: 'PLANNED', scheduledAt: { lt: new Date() } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.salesVisit.findMany({
        where,
        include: { lead: leadSelect },
        orderBy: { scheduledAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesVisit.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async findById(id: UUID): Promise<SalesVisitItem | null> {
    const row = await this.prisma.salesVisit.findFirst({
      where: { id, deletedAt: null },
      include: { lead: leadSelect },
    });
    return row ? toItem(row) : null;
  }

  async leadStage(leadId: UUID): Promise<LeadStage | null> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, deletedAt: null },
      select: { stage: true },
    });
    return lead ? lead.stage : null;
  }

  async salespersonName(userId: UUID): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : null;
  }

  async create(
    data: CreateSalesVisitData,
    sideEffect: LeadVisitSideEffect | null,
    actorId: UUID,
  ): Promise<SalesVisitItem> {
    const completedNow =
      data.completedAt !== undefined
        ? data.completedAt
          ? new Date(data.completedAt)
          : null
        : data.status === 'COMPLETED'
          ? new Date()
          : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.salesVisit.create({
        data: {
          leadId: data.leadId,
          salespersonUserId: data.salespersonUserId ?? null,
          salespersonName: data.salespersonName,
          ...(data.purpose !== undefined ? { purpose: data.purpose } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          outcome: data.outcome ?? null,
          scheduledAt: new Date(data.scheduledAt),
          completedAt: completedNow,
          location: data.location ?? null,
          notes: data.notes ?? null,
          nextFollowUpAt: dateValue(data.nextFollowUpAt) ?? null,
          createdBy: actorId,
        },
        include: { lead: leadSelect },
      });
      if (sideEffect) await applySideEffect(tx, data.leadId, sideEffect, actorId);
      return created;
    });
    return toItem(row);
  }

  async update(
    id: UUID,
    data: UpdateSalesVisitData,
    sideEffect: LeadVisitSideEffect | null,
    actorId: UUID,
  ): Promise<SalesVisitItem> {
    const completed =
      data.completedAt !== undefined
        ? { completedAt: data.completedAt ? new Date(data.completedAt) : null }
        : data.status === 'COMPLETED'
          ? { completedAt: new Date() }
          : {};

    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesVisit.findFirst({
        where: { id, deletedAt: null },
        select: { leadId: true },
      });
      if (!existing) throw new NotFoundError('Visit not found');

      const updated = await tx.salesVisit.updateMany({
        where: { id, deletedAt: null, version: data.version },
        data: {
          ...(data.salespersonUserId !== undefined
            ? { salespersonUserId: data.salespersonUserId }
            : {}),
          ...(data.salespersonName !== undefined ? { salespersonName: data.salespersonName } : {}),
          ...(data.purpose !== undefined ? { purpose: data.purpose } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.outcome !== undefined ? { outcome: data.outcome } : {}),
          ...(data.scheduledAt !== undefined ? { scheduledAt: new Date(data.scheduledAt) } : {}),
          ...completed,
          ...(data.location !== undefined ? { location: data.location } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.nextFollowUpAt !== undefined
            ? { nextFollowUpAt: dateValue(data.nextFollowUpAt) }
            : {}),
          updatedBy: actorId,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Visit was modified by someone else. Reload and retry.');
      }
      if (sideEffect) await applySideEffect(tx, existing.leadId, sideEffect, actorId);
      return tx.salesVisit.findFirstOrThrow({ where: { id }, include: { lead: leadSelect } });
    });
    return toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.salesVisit.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy },
    });
    if (res.count === 0) throw new NotFoundError('Visit not found');
  }
}
