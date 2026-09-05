import {
  canDecide,
  checkCredit,
  DEFAULT_APPROVAL_LEVELS,
  parseApprovalLevels,
  requiredLevel,
} from './credit';

const position = (overrides: Partial<Parameters<typeof checkCredit>[0]> = {}) => ({
  creditLimit: 100_000,
  creditDays: 30,
  outstanding: 40_000,
  oldestOverdueDays: 0,
  overdueAmount: 0,
  documentValue: 20_000,
  ...overrides,
});

describe('checkCredit', () => {
  it('passes a customer well inside both', () => {
    const check = checkCredit(position());
    expect(check.verdict).toBe('OK');
    expect(check.exposure).toBe(60_000);
    expect(check.message).toBeNull();
  });

  it('catches an exposure past the limit', () => {
    const check = checkCredit(position({ documentValue: 80_000 }));
    expect(check.verdict).toBe('OVER_LIMIT');
    expect(check.overLimitBy).toBe(20_000);
    expect(check.message).toMatch(/over by/);
  });

  it('catches an overdue bill even when the limit is fine', () => {
    // The case checking only the limit misses entirely: a customer inside their limit who
    // has not paid in ninety days can otherwise keep buying forever.
    const check = checkCredit(
      position({ oldestOverdueDays: 90, overdueAmount: 30_000 }),
    );
    expect(check.verdict).toBe('OVERDUE');
    expect(check.overLimitBy).toBe(0);
    expect(check.message).toMatch(/90 days past the 30-day term/);
  });

  it('reports both when both are breached', () => {
    const check = checkCredit(
      position({ documentValue: 80_000, oldestOverdueDays: 45, overdueAmount: 10_000 }),
    );
    expect(check.verdict).toBe('BOTH');
    expect(check.message).toMatch(/over by/);
    expect(check.message).toMatch(/past the/);
  });

  it('treats a limit of zero as no limit rather than a limit of nothing', () => {
    const check = checkCredit(position({ creditLimit: 0, documentValue: 5_000_000 }));
    expect(check.verdict).toBe('OK');
    expect(check.overLimitBy).toBe(0);
  });

  it('treats a term of zero as no term', () => {
    const check = checkCredit(position({ creditDays: 0, oldestOverdueDays: 200 }));
    expect(check.verdict).toBe('OK');
  });

  it('allows exposure exactly at the limit', () => {
    expect(checkCredit(position({ documentValue: 60_000 })).verdict).toBe('OK');
  });

  it('says a single day in the singular', () => {
    const check = checkCredit(position({ oldestOverdueDays: 1, overdueAmount: 500 }));
    expect(check.message).toMatch(/1 day past/);
  });
});

describe('requiredLevel', () => {
  it('sends a small excess to the first rung', () => {
    expect(requiredLevel(10_000)).toBe(1);
    expect(requiredLevel(50_000)).toBe(1);
  });

  it('climbs as the excess grows', () => {
    expect(requiredLevel(50_001)).toBe(2);
    expect(requiredLevel(200_000)).toBe(2);
    expect(requiredLevel(200_001)).toBe(3);
  });

  it('still needs somebody for an overdue-only breach', () => {
    // No excess, but being inside a limit is not the same as being paid.
    expect(requiredLevel(0)).toBe(1);
  });

  it('gives the top rung anything past every ceiling', () => {
    expect(requiredLevel(50_000_000)).toBe(3);
  });

  it('takes a ladder of its own', () => {
    const ladder = [
      { level: 1, maxExcess: 1_000 },
      { level: 2, maxExcess: 0 },
    ];
    expect(requiredLevel(500, ladder)).toBe(1);
    expect(requiredLevel(5_000, ladder)).toBe(2);
  });
});

describe('canDecide', () => {
  it('lets a higher rung decide a lower request', () => {
    expect(canDecide([3], 1)).toBe(true);
    expect(canDecide([2], 2)).toBe(true);
  });

  it('refuses a rung below what is needed', () => {
    expect(canDecide([1], 2)).toBe(false);
    expect(canDecide([], 1)).toBe(false);
  });
});

describe('parseApprovalLevels', () => {
  it('reads a configured ladder', () => {
    expect(parseApprovalLevels('[{"level":1,"maxExcess":5000}]')).toEqual([
      { level: 1, maxExcess: 5000 },
    ]);
  });

  it('falls back rather than throwing on nonsense', () => {
    // A malformed setting must not stop the counter selling.
    expect(parseApprovalLevels('not json')).toEqual(DEFAULT_APPROVAL_LEVELS);
    expect(parseApprovalLevels('[]')).toEqual(DEFAULT_APPROVAL_LEVELS);
    expect(parseApprovalLevels('{"level":1}')).toEqual(DEFAULT_APPROVAL_LEVELS);
    expect(parseApprovalLevels(null)).toEqual(DEFAULT_APPROVAL_LEVELS);
    expect(parseApprovalLevels('')).toEqual(DEFAULT_APPROVAL_LEVELS);
  });

  it('drops entries that are not levels', () => {
    expect(parseApprovalLevels('[{"level":1,"maxExcess":100},{"nope":true}]')).toEqual([
      { level: 1, maxExcess: 100 },
    ]);
  });
});
