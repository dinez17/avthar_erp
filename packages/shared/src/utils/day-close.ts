const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Indian currency, largest first — the order a drawer is counted in.
 *
 * ₹2,000 is included though the Reserve Bank withdrew it from circulation in 2023: it
 * remains legal tender, and a drawer that has one needs somewhere to put it. A row that is
 * always zero costs nothing; a note with nowhere to go gets counted into the wrong line.
 */
export const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export type Denomination = (typeof DENOMINATIONS)[number];

/** How many of each note and coin were counted. Missing means none. */
export type DenominationCounts = Partial<Record<Denomination, number>>;

/** What the counted notes add up to. */
export function denominationTotal(counts: DenominationCounts): number {
  return round2(
    DENOMINATIONS.reduce(
      (total, denomination) => total + denomination * (counts[denomination] ?? 0),
      0,
    ),
  );
}

/** Whether anything was actually counted, as opposed to a form left blank. */
export function hasCounted(counts: DenominationCounts): boolean {
  return DENOMINATIONS.some((denomination) => (counts[denomination] ?? 0) > 0);
}

/**
 * Whether an entry falls inside a day that has already been closed.
 *
 * Closing a day says "this is what was there". Letting an entry land behind that count
 * makes the statement false without changing the piece of paper it was written on, which
 * is the one thing a close exists to prevent.
 *
 * Both dates are compared by day: an entry at any hour of a closed day is behind it.
 */
export function isDayLocked(entryDate: Date, lastCloseDate: Date | null): boolean {
  if (!lastCloseDate) return false;
  const day = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return day(entryDate) <= day(lastCloseDate);
}

export interface CloseProblemInput {
  /** The day being closed. */
  closeDate: Date;
  /** The most recent close for this account, if any. */
  lastCloseDate: Date | null;
  countedAmount: number;
  /** Now, injected so the rule is testable rather than reading the clock itself. */
  today?: Date;
}

/**
 * Why a day cannot be closed, in the words the person would want to read.
 *
 * Returns null when it can.
 */
export function closeProblem(input: CloseProblemInput): string | null {
  const today = input.today ?? new Date();
  const day = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (day(input.closeDate) > day(today)) {
    return 'That day has not happened yet';
  }
  if (input.lastCloseDate && day(input.closeDate) <= day(input.lastCloseDate)) {
    return 'That day is already closed — reopen it if the count was wrong';
  }
  if (input.countedAmount < 0) {
    return 'A drawer cannot hold less than nothing';
  }
  return null;
}

/**
 * How a variance should be read.
 *
 * A rupee or two is rounding and not worth a conversation. Anything larger is a real
 * difference, and the sign matters more than the size: short means money left without a
 * record, over means money arrived without one.
 */
export type VarianceVerdict = 'BALANCED' | 'SHORT' | 'OVER';

export function varianceVerdict(variance: number, tolerance = 1): VarianceVerdict {
  if (Math.abs(round2(variance)) <= tolerance) return 'BALANCED';
  return variance < 0 ? 'SHORT' : 'OVER';
}

export interface HandoverPlan {
  /** What goes to the owner. */
  handover: number;
  /** What the drawer keeps, which is tomorrow's opening balance. */
  retained: number;
}

/**
 * Splitting a counted drawer between the owner and tomorrow morning.
 *
 * The float is what the branch needs to make change with before the first sale; everything
 * above it goes to the owner. Rounded down to a note the drawer can actually hand over —
 * asking someone to keep 2,487.50 back means counting coins into an envelope at closing
 * time, and the float is a working figure, not an accounting one.
 */
export function handoverPlan(counted: number, float: number, roundTo = 100): HandoverPlan {
  const available = round2(counted) - Math.max(0, round2(float));
  if (available <= 0) return { handover: 0, retained: round2(counted) };

  const step = roundTo > 0 ? roundTo : 1;
  const handover = Math.floor(available / step) * step;
  return { handover: round2(handover), retained: round2(round2(counted) - handover) };
}

/**
 * Why a handover cannot be made, or null.
 *
 * The drawer cannot hand over more than was counted in it, and money has to go somewhere
 * — an amount with no owner named is cash that has left the till and entered nothing.
 */
export function handoverProblem(
  handover: number,
  counted: number,
  ownerAccountId: string | null,
): string | null {
  const amount = round2(handover);
  if (amount <= 0) return null;
  if (amount > round2(counted) + 0.005) {
    return `Only ${round2(counted).toFixed(2)} was counted — that is all there is to hand over`;
  }
  if (!ownerAccountId) return 'Choose who is taking the cash';
  return null;
}

/**
 * The entry that brings the book to what was counted.
 *
 * A drawer that is short by 250 needs 250 taken out of the book, not added — the book is
 * the thing that is wrong, and the count is the thing that is true.
 */
export function adjustmentFor(variance: number): { direction: 'IN' | 'OUT'; amount: number } | null {
  const amount = round2(Math.abs(variance));
  if (amount < 0.005) return null;
  return { direction: variance > 0 ? 'IN' : 'OUT', amount };
}
