const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Which way the money went. */
export type CashDirection = 'IN' | 'OUT';

/** The least an entry has to be, to sit in a running balance. */
export interface CashMovement {
  direction: CashDirection;
  amount: number;
}

/** What an entry does to a balance: IN adds, OUT subtracts. */
export function signedAmount(movement: CashMovement): number {
  return movement.direction === 'IN' ? round2(movement.amount) : -round2(movement.amount);
}

export interface RunningRow<T> {
  entry: T;
  /** The balance after this entry, in the order given. */
  balance: number;
}

/**
 * Walks a day's entries and carries the balance forward.
 *
 * The order given is the order kept. A cash book is read down the page, and re-sorting it
 * here would leave a running balance that jumps around against the rows printed beside
 * it — the caller sorts once, by date then by entry number, and this trusts that.
 */
export function runningBalance<T extends CashMovement>(
  opening: number,
  entries: T[],
): { rows: RunningRow<T>[]; closing: number } {
  let balance = round2(opening);
  const rows = entries.map((entry) => {
    balance = round2(balance + signedAmount(entry));
    return { entry, balance };
  });
  return { rows, closing: balance };
}

export interface CashTotals {
  received: number;
  paid: number;
  /** Received less paid — what the day added to the account. */
  net: number;
}

export function cashTotals(entries: CashMovement[]): CashTotals {
  const received = round2(
    entries.filter((e) => e.direction === 'IN').reduce((sum, e) => sum + e.amount, 0),
  );
  const paid = round2(
    entries.filter((e) => e.direction === 'OUT').reduce((sum, e) => sum + e.amount, 0),
  );
  return { received, paid, net: round2(received - paid) };
}

/**
 * Whether a drawer can afford a payment.
 *
 * Cash cannot go negative: a drawer holding 5,000 cannot pay out 6,000, whatever the
 * books say, because the notes are not there. A bank account can — that is what an
 * overdraft is — so the caller decides which rule applies.
 */
export function wouldOverdraw(balance: number, amount: number): boolean {
  return round2(balance) - round2(amount) < -0.005;
}

/** A transfer needs two different accounts and a real amount. */
export function transferProblem(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
): string | null {
  if (!fromAccountId || !toAccountId) return 'Choose both accounts';
  if (fromAccountId === toAccountId) {
    return 'The two accounts must differ — money cannot move to where it already is';
  }
  if (round2(amount) <= 0) return 'Enter an amount greater than zero';
  return null;
}

/**
 * The counting of a drawer against what the book says it should hold.
 *
 * A shortfall is the number that matters and the one people avoid writing down, so it is
 * returned plainly rather than as an absolute difference: negative means the drawer is
 * short, positive means there is more in it than the book expects.
 */
export function cashVariance(counted: number, expected: number): number {
  return round2(counted - expected);
}
