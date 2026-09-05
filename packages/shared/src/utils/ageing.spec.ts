import {
  AGEING_BUCKETS,
  AGEING_BUCKET_LABELS,
  ageingBucketFor,
  isOverdue,
  overdueDays,
} from './ageing';

describe('ageingBucketFor', () => {
  it.each([
    [-5, 'current'],
    [0, 'current'],
    [1, 'days30'],
    [30, 'days30'],
    [31, 'days60'],
    [60, 'days60'],
    [61, 'days90'],
    [90, 'days90'],
    [91, 'older'],
    [400, 'older'],
  ])('puts %i days in %s', (days, bucket) => {
    expect(ageingBucketFor(days)).toBe(bucket);
  });

  it('has a label and an order for every bucket it can return', () => {
    for (const bucket of AGEING_BUCKETS) {
      expect(AGEING_BUCKET_LABELS[bucket]).toBeTruthy();
    }
    // Nothing outside the declared list can come back out of the rule.
    for (const days of [-1, 0, 15, 45, 75, 120]) {
      expect(AGEING_BUCKETS).toContain(ageingBucketFor(days));
    }
  });
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-07T12:00:00.000Z').getTime();
const daysAgo = (days: number): Date => new Date(NOW - days * DAY);

describe('overdueDays', () => {
  it('measures from the due date when there is one', () => {
    expect(overdueDays(daysAgo(10), daysAgo(40), NOW)).toBe(10);
  });

  it('is not yet due when the due date is in the future', () => {
    expect(overdueDays(new Date(NOW + 5 * DAY), daysAgo(10), NOW)).toBe(-5);
  });

  it('ages from the document date when no credit was given', () => {
    expect(overdueDays(null, daysAgo(3), NOW)).toBe(3);
  });

  it('treats a bill raised today as not yet late', () => {
    expect(overdueDays(null, new Date(NOW), NOW)).toBe(0);
  });
});

describe('isOverdue', () => {
  it('is false on the day the bill falls due', () => {
    expect(isOverdue(new Date(NOW), daysAgo(30), NOW)).toBe(false);
  });

  it('is true the day after', () => {
    expect(isOverdue(daysAgo(1), daysAgo(31), NOW)).toBe(true);
  });

  it('counts a cash bill left unpaid, even with no due date', () => {
    expect(isOverdue(null, daysAgo(2), NOW)).toBe(true);
  });
});
