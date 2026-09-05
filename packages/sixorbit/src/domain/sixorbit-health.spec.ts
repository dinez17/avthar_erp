import {
  buildSyncHealth,
  SIXORBIT_ENTITY_TYPES,
  type BuildSyncHealthInput,
} from './sixorbit-health';

const AT = (iso: string): Date => new Date(iso);

const input = (over: Partial<BuildSyncHealthInput> = {}): BuildSyncHealthInput => ({
  windowHours: 24,
  counts: [],
  lastSuccesses: [],
  lastFailures: [],
  failingRecords: 0,
  averageDurationMs: null,
  slowestDurationMs: null,
  generatedAt: AT('2026-08-20T10:00:00.000Z'),
  ...over,
});

describe('buildSyncHealth', () => {
  it('lists every entity type, including ones never attempted', () => {
    // A blank row is information: it says "products have never synced", which is exactly
    // what someone opening this page after a failed rollout needs to see.
    const health = buildSyncHealth(input());
    expect(health.byEntity).toHaveLength(SIXORBIT_ENTITY_TYPES.length);
    expect(health.byEntity.map((e) => e.entityType)).toEqual([...SIXORBIT_ENTITY_TYPES]);
    expect(health.byEntity.every((e) => e.successes === 0 && e.lastSuccessAt === null)).toBe(true);
  });

  it('splits counts by outcome and attributes them to the right entity', () => {
    const health = buildSyncHealth(
      input({
        counts: [
          { entityType: 'CUSTOMER', success: true, count: 7 },
          { entityType: 'CUSTOMER', success: false, count: 2 },
          { entityType: 'PRODUCT', success: true, count: 5 },
        ],
      }),
    );

    const customer = health.byEntity.find((e) => e.entityType === 'CUSTOMER');
    expect(customer).toMatchObject({ successes: 7, failures: 2 });
    expect(health.byEntity.find((e) => e.entityType === 'PRODUCT')).toMatchObject({
      successes: 5,
      failures: 0,
    });
    expect(health.totalAttempts).toBe(14);
    expect(health.totalFailures).toBe(2);
  });

  it('keeps last-succeeded and last-failed apart', () => {
    // The bug this guards: reporting the last *attempt* as the last success, so a module
    // that has been failing for a week still looks like it worked five minutes ago.
    const health = buildSyncHealth(
      input({
        lastSuccesses: [{ entityType: 'PRODUCT', at: AT('2026-08-13T09:00:00.000Z') }],
        lastFailures: [{ entityType: 'PRODUCT', at: AT('2026-08-20T09:55:00.000Z') }],
      }),
    );

    const product = health.byEntity.find((e) => e.entityType === 'PRODUCT');
    expect(product?.lastSuccessAt).toBe('2026-08-13T09:00:00.000Z');
    expect(product?.lastFailureAt).toBe('2026-08-20T09:55:00.000Z');
  });

  it('reports a last-succeeded from outside the window, since those times are all-time', () => {
    const health = buildSyncHealth(
      input({
        windowHours: 1,
        counts: [],
        lastSuccesses: [{ entityType: 'MASTER', at: AT('2026-01-01T00:00:00.000Z') }],
      }),
    );
    const master = health.byEntity.find((e) => e.entityType === 'MASTER');
    expect(master?.lastSuccessAt).toBe('2026-01-01T00:00:00.000Z');
    // …while the counts, which are windowed, stay empty.
    expect(master?.successes).toBe(0);
  });

  it('rounds the average duration and defaults an empty window to zero', () => {
    expect(buildSyncHealth(input({ averageDurationMs: 412.6666 })).averageDurationMs).toBe(413);
    expect(buildSyncHealth(input()).averageDurationMs).toBe(0);
    expect(buildSyncHealth(input()).slowestDurationMs).toBe(0);
  });

  it('passes the dead-letter count through untouched', () => {
    // It is a count of records, not attempts, and must not be re-derived from `counts`.
    const health = buildSyncHealth(
      input({
        failingRecords: 3,
        counts: [{ entityType: 'CUSTOMER', success: false, count: 18 }],
      }),
    );
    expect(health.failingRecords).toBe(3);
    expect(health.totalFailures).toBe(18);
  });
});
