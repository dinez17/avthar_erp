const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The tolerance a money comparison is made with.
 *
 * Half a paisa. Balances are rounded to two places on the way in and out, so an exact
 * comparison can reject a payment that clears an invoice to the last paisa because the
 * two figures differ in the fifteenth decimal place.
 */
export const MONEY_EPSILON = 0.005;

/** Anything a settlement can be applied to: an open bill, in or out. */
export interface Settleable {
  balanceAmount: number;
}

export interface Settlement<T extends Settleable> {
  target: T;
  amount: number;
}

/**
 * Spreads an amount over open documents, oldest first.
 *
 * This is how a counter actually settles an account: money is handed over without
 * saying which bill it is for, and the oldest is cleared first. Anything left when
 * every document is clear is not forced anywhere — it comes back as `remaining` and the
 * caller decides, which for both receipts and payments means it sits on account.
 *
 * The list is taken in the order given. Callers order it, because "oldest" means by due
 * date on a payable and by invoice date on a receivable.
 */
export function settleOldestFirst<T extends Settleable>(
  amount: number,
  open: T[],
): { settlements: Settlement<T>[]; remaining: number } {
  let remaining = round2(amount);
  const settlements: Settlement<T>[] = [];

  for (const target of open) {
    if (remaining <= MONEY_EPSILON) break;
    const settled = round2(Math.min(target.balanceAmount, remaining));
    if (settled <= 0) continue;
    settlements.push({ target, amount: settled });
    remaining = round2(remaining - settled);
  }

  return { settlements, remaining: round2(remaining) };
}

/** True when `amount` exceeds `limit` by more than a rounding difference. */
export function exceeds(amount: number, limit: number): boolean {
  return round2(amount) > round2(limit) + MONEY_EPSILON;
}

/** True when a balance is worth showing — anything smaller is rounding dust. */
export function isOutstanding(balance: number): boolean {
  return round2(balance) > MONEY_EPSILON;
}
