import {
  cashTotals,
  cashVariance,
  runningBalance,
  signedAmount,
  transferProblem,
  wouldOverdraw,
} from './cash-book';

const inn = (amount: number) => ({ direction: 'IN' as const, amount });
const out = (amount: number) => ({ direction: 'OUT' as const, amount });

describe('signedAmount', () => {
  it('adds money in and subtracts money out', () => {
    expect(signedAmount(inn(500))).toBe(500);
    expect(signedAmount(out(500))).toBe(-500);
  });
});

describe('runningBalance', () => {
  it('carries the opening forward through the day', () => {
    const { rows, closing } = runningBalance(1000, [inn(500), out(200), inn(50)]);
    expect(rows.map((r) => r.balance)).toEqual([1500, 1300, 1350]);
    expect(closing).toBe(1350);
  });

  it('closes at the opening when nothing moved', () => {
    expect(runningBalance(1000, []).closing).toBe(1000);
  });

  it('keeps the order given rather than sorting', () => {
    const { rows } = runningBalance(0, [out(100), inn(100)]);
    expect(rows.map((r) => r.balance)).toEqual([-100, 0]);
  });

  it('lets the balance go negative rather than clamping it', () => {
    expect(runningBalance(100, [out(400)]).closing).toBe(-300);
  });

  it('does not accumulate float dust across many rows', () => {
    const entries = Array.from({ length: 30 }, () => inn(0.1));
    expect(runningBalance(0, entries).closing).toBe(3);
  });
});

describe('cashTotals', () => {
  it('splits the day into received and paid', () => {
    expect(cashTotals([inn(500), out(200), inn(50), out(30)])).toEqual({
      received: 550,
      paid: 230,
      net: 320,
    });
  });

  it('is all zeros for a day with no movement', () => {
    expect(cashTotals([])).toEqual({ received: 0, paid: 0, net: 0 });
  });

  it('reports a negative net on a day that paid out more than it took', () => {
    expect(cashTotals([inn(100), out(400)]).net).toBe(-300);
  });
});

describe('wouldOverdraw', () => {
  it('is false when the drawer covers it exactly', () => {
    expect(wouldOverdraw(5000, 5000)).toBe(false);
  });

  it('is true when the notes are not there', () => {
    expect(wouldOverdraw(5000, 6000)).toBe(true);
  });

  it('ignores a rounding difference', () => {
    expect(wouldOverdraw(5000, 5000.004)).toBe(false);
  });
});

describe('transferProblem', () => {
  it('accepts a transfer between two accounts', () => {
    expect(transferProblem('a', 'b', 5000)).toBeNull();
  });

  it('refuses a transfer to the same account', () => {
    expect(transferProblem('a', 'a', 5000)).toMatch(/must differ/);
  });

  it('refuses a missing account', () => {
    expect(transferProblem('', 'b', 5000)).toMatch(/both accounts/);
  });

  it('refuses zero and negative amounts', () => {
    expect(transferProblem('a', 'b', 0)).toMatch(/greater than zero/);
    expect(transferProblem('a', 'b', -100)).toMatch(/greater than zero/);
  });
});

describe('cashVariance', () => {
  it('is negative when the drawer is short', () => {
    expect(cashVariance(4800, 5000)).toBe(-200);
  });

  it('is positive when there is more than expected', () => {
    expect(cashVariance(5200, 5000)).toBe(200);
  });

  it('is zero when it ties', () => {
    expect(cashVariance(5000, 5000)).toBe(0);
  });
});
