import type {
  SixOrbitEntityHealth,
  SixOrbitEntityType,
  SixOrbitSyncHealth,
} from '@tiles-erp/shared-types';

/**
 * Shaping the health summary.
 *
 * Kept separate from the repository — and pure — because the arithmetic here is the part
 * that can be wrong in a way nobody notices: a count attributed to the wrong entity, or a
 * "last succeeded" that quietly reports the last *attempt*. Those are testable without a
 * database, so they are tested.
 */

/** Every entity type, so the summary lists one that has never been tried as well. */
export const SIXORBIT_ENTITY_TYPES: readonly SixOrbitEntityType[] = [
  'CONNECTION',
  'MASTER',
  'CUSTOMER',
  'PRODUCT',
  'SALES_ORDER',
];

/** One `groupBy(entityType, success)` row from inside the window. */
export interface SyncCountRow {
  entityType: SixOrbitEntityType;
  success: boolean;
  count: number;
}

/** One `groupBy(entityType)` row of all-time `max(createdAt)`, per outcome. */
export interface SyncLastRow {
  entityType: SixOrbitEntityType;
  at: Date;
}

export interface BuildSyncHealthInput {
  windowHours: number;
  counts: SyncCountRow[];
  lastSuccesses: SyncLastRow[];
  lastFailures: SyncLastRow[];
  failingRecords: number;
  averageDurationMs: number | null;
  slowestDurationMs: number | null;
  generatedAt: Date;
}

export function buildSyncHealth(input: BuildSyncHealthInput): SixOrbitSyncHealth {
  const successAt = new Map(input.lastSuccesses.map((r) => [r.entityType, r.at]));
  const failureAt = new Map(input.lastFailures.map((r) => [r.entityType, r.at]));

  const successes = new Map<SixOrbitEntityType, number>();
  const failures = new Map<SixOrbitEntityType, number>();
  for (const row of input.counts) {
    const target = row.success ? successes : failures;
    target.set(row.entityType, (target.get(row.entityType) ?? 0) + row.count);
  }

  const byEntity: SixOrbitEntityHealth[] = SIXORBIT_ENTITY_TYPES.map((entityType) => ({
    entityType,
    lastSuccessAt: successAt.get(entityType)?.toISOString() ?? null,
    lastFailureAt: failureAt.get(entityType)?.toISOString() ?? null,
    successes: successes.get(entityType) ?? 0,
    failures: failures.get(entityType) ?? 0,
  }));

  const totalAttempts = byEntity.reduce((sum, e) => sum + e.successes + e.failures, 0);
  const totalFailures = byEntity.reduce((sum, e) => sum + e.failures, 0);

  return {
    windowHours: input.windowHours,
    totalAttempts,
    totalFailures,
    failingRecords: input.failingRecords,
    // Rounded: a millisecond average to fourteen decimal places is noise on a dashboard.
    averageDurationMs: Math.round(input.averageDurationMs ?? 0),
    slowestDurationMs: input.slowestDurationMs ?? 0,
    byEntity,
    generatedAt: input.generatedAt.toISOString(),
  };
}
