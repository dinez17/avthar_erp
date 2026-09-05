import { type PrismaClient } from '@prisma/client';
import type { Prisma, SixOrbitSyncLog } from '@prisma/client';
import { PAGINATION } from '@tiles-erp/config';
import type {
  Paginated,
  SixOrbitSyncHealth,
  SixOrbitSyncLogItem,
  SixOrbitSyncLogQuery,
} from '@tiles-erp/shared-types';
import { buildSyncHealth, type SyncCountRow, type SyncLastRow } from '../domain/sixorbit-health';
import type {
  SixOrbitSyncLogEntry,
  SixOrbitSyncLogRepository,
} from '../domain/sixorbit-sync-log.repository';

/**
 * How much of a response body is kept.
 *
 * A product pull can return megabytes, and storing every one of those in full would turn
 * the log table into the largest thing in the database within a week. The first 4 KB is
 * enough to see the shape and read an error; the rest is noise once the call is over.
 */
const RESPONSE_BODY_LIMIT = 4000;

const toItem = (row: SixOrbitSyncLog): SixOrbitSyncLogItem => ({
  id: row.id,
  entityType: row.entityType,
  entityId: row.entityId,
  externalId: row.externalId,
  task: row.task,
  direction: row.direction,
  attempt: row.attempt,
  success: row.success,
  resultCode: row.resultCode,
  message: row.message,
  requestSummary: row.requestSummary,
  requestBody: row.requestBody,
  responseBody: row.responseBody,
  durationMs: row.durationMs,
  jobId: row.jobId,
  createdAt: row.createdAt.toISOString(),
});

export class PrismaSixOrbitSyncLogRepository implements SixOrbitSyncLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: SixOrbitSyncLogEntry): Promise<void> {
    await this.prisma.sixOrbitSyncLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        externalId: entry.externalId ?? null,
        task: entry.task,
        direction: entry.direction,
        attempt: entry.attempt,
        success: entry.success,
        resultCode: entry.resultCode ?? null,
        message: entry.message ?? null,
        requestSummary: entry.requestSummary ?? null,
        requestBody: entry.requestBody?.slice(0, RESPONSE_BODY_LIMIT) ?? null,
        responseBody: entry.responseBody?.slice(0, RESPONSE_BODY_LIMIT) ?? null,
        durationMs: entry.durationMs,
        jobId: entry.jobId ?? null,
      },
    });
  }

  async list(query: SixOrbitSyncLogQuery): Promise<Paginated<SixOrbitSyncLogItem>> {
    const page = query.page ?? PAGINATION.DEFAULT_PAGE;
    const pageSize = Math.min(
      query.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE,
      PAGINATION.MAX_PAGE_SIZE,
    );

    const where: Prisma.SixOrbitSyncLogWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.success !== undefined ? { success: query.success } : {}),
      ...(query.task ? { task: { contains: query.task, mode: 'insensitive' } } : {}),
      // Free text spans the three columns someone actually searches by. `entityId` is
      // excluded deliberately: it is a uuid column, and Postgres will not run `contains`
      // against one without a cast — it has its own exact-match filter above.
      ...(query.search
        ? {
            OR: [
              { task: { contains: query.search, mode: 'insensitive' as const } },
              { message: { contains: query.search, mode: 'insensitive' as const } },
              { externalId: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [rows, totalItems] = await Promise.all([
      this.prisma.sixOrbitSyncLog.findMany({
        where,
        // Newest first: the row someone is looking for is almost always the last failure.
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sixOrbitSyncLog.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      items: rows.map(toItem),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    };
  }

  async health(windowHours: number): Promise<SixOrbitSyncHealth> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const windowed = { createdAt: { gte: since } };

    const [counts, lastSuccesses, lastFailures, durations, failingRecords] = await Promise.all([
      this.prisma.sixOrbitSyncLog.groupBy({
        by: ['entityType', 'success'],
        where: windowed,
        _count: { _all: true },
      }),
      // All-time, not windowed: "when did this last work at all" is the useful question.
      this.prisma.sixOrbitSyncLog.groupBy({
        by: ['entityType'],
        where: { success: true },
        _max: { createdAt: true },
      }),
      this.prisma.sixOrbitSyncLog.groupBy({
        by: ['entityType'],
        where: { success: false },
        _max: { createdAt: true },
      }),
      this.prisma.sixOrbitSyncLog.aggregate({
        where: windowed,
        _avg: { durationMs: true },
        _max: { durationMs: true },
      }),
      this.countFailingRecords(),
    ]);

    const toLastRows = (
      rows: { entityType: SixOrbitSyncLog['entityType']; _max: { createdAt: Date | null } }[],
    ): SyncLastRow[] =>
      rows
        .filter((r): r is typeof r & { _max: { createdAt: Date } } => r._max.createdAt !== null)
        .map((r) => ({ entityType: r.entityType, at: r._max.createdAt }));

    return buildSyncHealth({
      windowHours,
      counts: counts.map((row): SyncCountRow => ({
        entityType: row.entityType,
        success: row.success,
        count: row._count._all,
      })),
      lastSuccesses: toLastRows(lastSuccesses),
      lastFailures: toLastRows(lastFailures),
      failingRecords,
      averageDurationMs: durations._avg.durationMs,
      slowestDurationMs: durations._max.durationMs,
      generatedAt: new Date(),
    });
  }

  async prune(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.sixOrbitSyncLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }

  /**
   * Records whose most recent attempt failed.
   *
   * `DISTINCT ON` is the concise way to ask Postgres for the latest row per record, and
   * this table is Postgres-only. Counting attempts instead would report one stubborn
   * customer as six problems, and would keep counting a record that has since succeeded.
   */
  private async countFailingRecords(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM (
        SELECT DISTINCT ON ("entityId") "entityId", "success"
        FROM "sixorbit_sync_logs"
        WHERE "entityId" IS NOT NULL
        ORDER BY "entityId", "createdAt" DESC
      ) latest
      WHERE latest."success" = false
    `;
    // Postgres count() is bigint, which Prisma hands back as a JS BigInt. Serialising one
    // to JSON throws, so it is narrowed here rather than at the edge.
    return Number(rows[0]?.count ?? 0);
  }
}
