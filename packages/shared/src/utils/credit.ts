const round2 = (value: number): number => Math.round(value * 100) / 100;

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Why a document cannot go through on the customer's credit. */
export type CreditVerdict = 'OK' | 'OVER_LIMIT' | 'OVERDUE' | 'BOTH';

export interface CreditPosition {
  /** Zero means no limit is set, and the limit is not enforced. */
  creditLimit: number;
  /** Days a bill may stand before it is overdue. Zero means no term is enforced. */
  creditDays: number;
  /** What the customer already owes on posted invoices. */
  outstanding: number;
  /** Age of their oldest unpaid bill, in days past its due date. Zero when nothing is. */
  oldestOverdueDays: number;
  /** The value of the bill still overdue, so an approver sees size as well as age. */
  overdueAmount: number;
  /** What this order or invoice would add. */
  documentValue: number;
}

export interface CreditCheck {
  verdict: CreditVerdict;
  /** Outstanding plus this document. */
  exposure: number;
  /** How far past the limit that exposure goes. Zero when inside it. */
  overLimitBy: number;
  /** Days past the term on the oldest unpaid bill. Zero when nothing is overdue. */
  overdueDays: number;
  /** Both reasons, in the words an approver needs to make the decision. */
  message: string | null;
}

/**
 * Whether a customer can carry this document.
 *
 * Two independent tests. A limit asks *how much* they owe; a term asks *how long* they have
 * owed it. A customer well inside their limit who has not paid a bill in ninety days is the
 * more dangerous of the two, and checking only the limit — which is what this did before —
 * lets that customer keep buying indefinitely.
 *
 * A limit or term of zero is not enforced. Zero means nobody has set one, not that the
 * customer may owe nothing.
 */
export function checkCredit(position: CreditPosition): CreditCheck {
  const exposure = round2(position.outstanding + position.documentValue);
  const overLimitBy =
    position.creditLimit > 0 ? round2(Math.max(0, exposure - position.creditLimit)) : 0;
  const overdueDays = position.creditDays > 0 ? Math.max(0, position.oldestOverdueDays) : 0;

  const over = overLimitBy > 0;
  const late = overdueDays > 0;

  if (!over && !late) {
    return { verdict: 'OK', exposure, overLimitBy: 0, overdueDays: 0, message: null };
  }

  const parts: string[] = [];
  if (over) {
    parts.push(
      `${money(exposure)} against a limit of ${money(position.creditLimit)} — over by ${money(overLimitBy)}`,
    );
  }
  if (late) {
    parts.push(
      `${money(position.overdueAmount)} is ${overdueDays} day${overdueDays === 1 ? '' : 's'} past the ${position.creditDays}-day term`,
    );
  }

  return {
    verdict: over && late ? 'BOTH' : over ? 'OVER_LIMIT' : 'OVERDUE',
    exposure,
    overLimitBy,
    overdueDays,
    message: parts.join('; '),
  };
}

/** One rung of the approval ladder: who may release how much. */
export interface ApprovalLevel {
  level: number;
  /** The most it may release. Zero means no ceiling. */
  maxExcess: number;
}

/**
 * The ladder, lowest rung first, as a sensible default.
 *
 * Read from the `credit.approvalLevels` setting when one exists. Kept here so an
 * installation that never opens settings still has a working ladder rather than a hole.
 */
export const DEFAULT_APPROVAL_LEVELS: ApprovalLevel[] = [
  { level: 1, maxExcess: 50_000 },
  { level: 2, maxExcess: 200_000 },
  { level: 3, maxExcess: 0 },
];

/**
 * The lowest rung that can release this breach.
 *
 * A breach with no excess — overdue only, inside the limit — still needs level 1. Somebody
 * has to look at it; being inside a limit is not the same as being paid.
 */
export function requiredLevel(
  overLimitBy: number,
  levels: ApprovalLevel[] = DEFAULT_APPROVAL_LEVELS,
): number {
  const ladder = [...levels].sort((a, b) => a.level - b.level);
  for (const rung of ladder) {
    if (rung.maxExcess === 0 || overLimitBy <= rung.maxExcess) return rung.level;
  }
  // Past every ceiling: the top rung owns it, whatever that rung says it can take.
  return ladder[ladder.length - 1]?.level ?? 1;
}

/** Whether a person holding these levels may decide a request needing `required`. */
export function canDecide(heldLevels: number[], required: number): boolean {
  return heldLevels.some((level) => level >= required);
}

/**
 * Reads the ladder out of a settings string, falling back rather than throwing.
 *
 * A malformed setting should not stop the counter selling. The default ladder is a working
 * one, and a wrong ceiling is a smaller problem than a crash on every credit check.
 */
export function parseApprovalLevels(raw: string | null | undefined): ApprovalLevel[] {
  if (!raw?.trim()) return DEFAULT_APPROVAL_LEVELS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_APPROVAL_LEVELS;

    const levels = parsed
      .map((entry) => entry as { level?: unknown; maxExcess?: unknown })
      .filter(
        (entry) => typeof entry.level === 'number' && typeof entry.maxExcess === 'number',
      )
      .map((entry) => ({ level: entry.level as number, maxExcess: entry.maxExcess as number }));

    return levels.length > 0 ? levels : DEFAULT_APPROVAL_LEVELS;
  } catch {
    return DEFAULT_APPROVAL_LEVELS;
  }
}
