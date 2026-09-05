import { exceeds, isOutstanding, settleOldestFirst } from './settlement';

const bill = (id: string, balanceAmount: number): { id: string; balanceAmount: number } => ({
  id,
  balanceAmount,
});

describe('settleOldestFirst', () => {
  const open = [bill('a', 1000), bill('b', 2500), bill('c', 500)];

  it('clears the first document before touching the next', () => {
    const { settlements, remaining } = settleOldestFirst(1200, open);
    expect(settlements).toEqual([
      { target: open[0], amount: 1000 },
      { target: open[1], amount: 200 },
    ]);
    expect(remaining).toBe(0);
  });

  it('returns what is left over rather than forcing it somewhere', () => {
    const { settlements, remaining } = settleOldestFirst(5000, open);
    expect(settlements).toHaveLength(3);
    expect(remaining).toBe(1000);
  });

  it('settles nothing when there is nothing open', () => {
    expect(settleOldestFirst(500, [])).toEqual({ settlements: [], remaining: 500 });
  });

  it('settles nothing for a zero amount', () => {
    expect(settleOldestFirst(0, open).settlements).toEqual([]);
  });

  it('skips a document with no balance instead of writing a zero row', () => {
    const { settlements } = settleOldestFirst(300, [bill('a', 0), bill('b', 300)]);
    expect(settlements).toEqual([{ target: expect.objectContaining({ id: 'b' }), amount: 300 }]);
  });

  it('does not leave a fraction of a paisa chasing the next document', () => {
    const { settlements, remaining } = settleOldestFirst(100.005, [bill('a', 100)]);
    expect(settlements).toEqual([{ target: expect.objectContaining({ id: 'a' }), amount: 100 }]);
    expect(remaining).toBe(0.01);
  });

  it('takes the list in the order given, not by sorting it', () => {
    const { settlements } = settleOldestFirst(600, [bill('c', 500), bill('a', 1000)]);
    expect(settlements[0]!.target).toMatchObject({ id: 'c' });
  });
});

describe('exceeds', () => {
  it('is false for an exact settlement', () => {
    expect(exceeds(1000, 1000)).toBe(false);
  });

  it('is false for a rounding difference', () => {
    expect(exceeds(1000.004, 1000)).toBe(false);
  });

  it('is true for a real overpayment', () => {
    expect(exceeds(1000.5, 1000)).toBe(true);
  });
});

describe('isOutstanding', () => {
  it('ignores rounding dust', () => {
    expect(isOutstanding(0.004)).toBe(false);
    expect(isOutstanding(0)).toBe(false);
  });

  it('is true for a real balance', () => {
    expect(isOutstanding(0.5)).toBe(true);
  });

  it('is false for an overpaid document', () => {
    expect(isOutstanding(-50)).toBe(false);
  });
});
