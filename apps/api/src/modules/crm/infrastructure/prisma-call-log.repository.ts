import { Injectable } from '@nestjs/common';
import type { CallLog, Prisma } from '@prisma/client';
import { buildPaginated, NotFoundError } from '@tiles-erp/shared';
import type {
  CallLogItem,
  LeadStage,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CallLogListFilter,
  CallLogRepository,
  CreateCallLogData,
  LeadCallSideEffect,
} from '../domain/call-log.repository';

/** A call row with the slim lead snapshot the read model carries. */
type Row = CallLog & { lead: { code: string; name: string } | null };

const toItem = (row: Row): CallLogItem => ({
  id: row.id,
  leadId: row.leadId,
  leadCode: row.lead?.code ?? null,
  leadName: row.lead?.name ?? null,
  callerUserId: row.callerUserId,
  callerName: row.callerName,
  direction: row.direction,
  disposition: row.disposition,
  durationSec: row.durationSec,
  calledAt: row.calledAt.toISOString(),
  callbackAt: row.callbackAt ? row.callbackAt.toISOString() : null,
  notes: row.notes,
  version: row.version,
});

const leadSelect = { select: { code: true, name: true } } as const;

@Injectable()
export class PrismaCallLogRepository implements CallLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQuery, filter: CallLogListFilter): Promise<Paginated<CallLogItem>> {
    const where: Prisma.CallLogWhereInput = {
      deletedAt: null,
      ...(filter.leadId ? { leadId: filter.leadId } : {}),
      ...(filter.callerUserId ? { callerUserId: filter.callerUserId } : {}),
      ...(filter.disposition ? { disposition: filter.disposition } : {}),
      ...(filter.callbackDue ? { callbackAt: { lte: new Date() } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.callLog.findMany({
        where,
        include: { lead: leadSelect },
        orderBy: { calledAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.callLog.count({ where }),
    ]);
    return buildPaginated(rows.map(toItem), query.page, query.pageSize, total);
  }

  async findById(id: UUID): Promise<CallLogItem | null> {
    const row = await this.prisma.callLog.findFirst({
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

  async callerName(userId: UUID): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : null;
  }

  async create(
    data: CreateCallLogData,
    sideEffect: LeadCallSideEffect | null,
    actorId: UUID,
  ): Promise<CallLogItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.callLog.create({
        data: {
          leadId: data.leadId,
          callerUserId: actorId,
          callerName: data.callerName,
          ...(data.direction !== undefined ? { direction: data.direction } : {}),
          disposition: data.disposition,
          durationSec: data.durationSec ?? null,
          ...(data.calledAt ? { calledAt: new Date(data.calledAt) } : {}),
          callbackAt: data.callbackAt ? new Date(data.callbackAt) : null,
          notes: data.notes ?? null,
          createdBy: actorId,
        },
        include: { lead: leadSelect },
      });

      if (sideEffect) {
        await tx.lead.updateMany({
          where: { id: data.leadId, deletedAt: null },
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
      }
      return created;
    });
    return toItem(row);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const res = await this.prisma.callLog.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy },
    });
    if (res.count === 0) throw new NotFoundError('Call log not found');
  }
}
