import type { AgeingBucket } from '@tiles-erp/shared-types';

/**
 * The boundaries between the ageing buckets.
 *
 * Receivables age from a due date and undelivered goods age from the invoice date, but
 * the columns are the same five — so the rule lives here rather than being written once
 * per report and quietly drifting apart.
 */

export const AGEING_BUCKETS: readonly AgeingBucket[] = [
  'current',
  'days30',
  'days60',
  'days90',
  'older',
];

/** Which column something that has waited `days` belongs in. */
export function ageingBucketFor(days: number): AgeingBucket {
  if (days <= 0) return 'current';
  if (days <= 30) return 'days30';
  if (days <= 60) return 'days60';
  if (days <= 90) return 'days90';
  return 'older';
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * How many days late a bill is.
 *
 * Age runs from the due date, because that is the promise that was broken. A bill with
 * no due date — a cash sale, or a supplier with no credit days — was payable on the day
 * it was raised, so it ages from its own date instead. Zero or less means it is not due
 * yet.
 *
 * Receivable or payable makes no difference: a bill is late when it is past its date,
 * whichever way the money is going.
 */
export function overdueDays(
  dueDate: Date | null,
  documentDate: Date,
  now: number = Date.now(),
): number {
  const from = dueDate ?? documentDate;
  return Math.floor((now - from.getTime()) / DAY);
}

/** True when the money is genuinely late, not merely unpaid. */
export function isOverdue(
  dueDate: Date | null,
  documentDate: Date,
  now: number = Date.now(),
): boolean {
  return overdueDays(dueDate, documentDate, now) > 0;
}

/** The heading each bucket prints under. */
export const AGEING_BUCKET_LABELS: Record<AgeingBucket, string> = {
  current: 'Not due',
  days30: '1–30 d',
  days60: '31–60 d',
  days90: '61–90 d',
  older: '90+ d',
};
