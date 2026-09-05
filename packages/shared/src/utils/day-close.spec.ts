import {
  adjustmentFor,
  closeProblem,
  denominationTotal,
  DENOMINATIONS,
  handoverPlan,
  handoverProblem,
  hasCounted,
  isDayLocked,
  varianceVerdict,
} from './day-close';

describe('denominationTotal', () => {
  it('adds up notes and coins', () => {
    expect(denominationTotal({ 500: 12, 100: 4, 20: 3, 1: 7 })).toBe(6467);
  });

  it('treats a missing denomination as none of them', () => {
    expect(denominationTotal({ 500: 2 })).toBe(1000);
  });

  it('counts an empty drawer as nothing', () => {
    expect(denominationTotal({})).toBe(0);
  });

  it('lists the notes largest first, the way a drawer is counted', () => {
    expect([...DENOMINATIONS]).toEqual([2000, 500, 200, 100, 50, 20, 10, 5, 2, 1]);
  });
});

describe('hasCounted', () => {
  it('tells a counted-empty drawer from an untouched form', () => {
    expect(hasCounted({})).toBe(false);
    expect(hasCounted({ 500: 0, 100: 0 })).toBe(false);
    expect(hasCounted({ 1: 1 })).toBe(true);
  });
});

describe('isDayLocked', () => {
  const CLOSED = new Date(2026, 7, 14);

  it('is open when nothing has ever been closed', () => {
    expect(isDayLocked(new Date(2026, 7, 14), null)).toBe(false);
  });

  it('locks the closed day itself, at any hour', () => {
    expect(isDayLocked(new Date(2026, 7, 14, 23, 59), CLOSED)).toBe(true);
    expect(isDayLocked(new Date(2026, 7, 14, 0, 1), CLOSED)).toBe(true);
  });

  it('locks everything before it', () => {
    expect(isDayLocked(new Date(2026, 6, 30), CLOSED)).toBe(true);
  });

  it('leaves the next day open', () => {
    expect(isDayLocked(new Date(2026, 7, 15, 0, 0), CLOSED)).toBe(false);
  });
});

describe('closeProblem', () => {
  const TODAY = new Date(2026, 7, 15);

  it('allows closing today', () => {
    expect(
      closeProblem({ closeDate: TODAY, lastCloseDate: null, countedAmount: 5000, today: TODAY }),
    ).toBeNull();
  });

  it('allows closing a day that was missed', () => {
    expect(
      closeProblem({
        closeDate: new Date(2026, 7, 13),
        lastCloseDate: null,
        countedAmount: 5000,
        today: TODAY,
      }),
    ).toBeNull();
  });

  it('refuses a day that has not happened', () => {
    expect(
      closeProblem({
        closeDate: new Date(2026, 7, 16),
        lastCloseDate: null,
        countedAmount: 0,
        today: TODAY,
      }),
    ).toMatch(/has not happened/);
  });

  it('refuses to close the same day twice', () => {
    expect(
      closeProblem({
        closeDate: new Date(2026, 7, 14),
        lastCloseDate: new Date(2026, 7, 14),
        countedAmount: 5000,
        today: TODAY,
      }),
    ).toMatch(/already closed/);
  });

  it('refuses to close a day behind the last close', () => {
    expect(
      closeProblem({
        closeDate: new Date(2026, 7, 10),
        lastCloseDate: new Date(2026, 7, 14),
        countedAmount: 5000,
        today: TODAY,
      }),
    ).toMatch(/already closed/);
  });

  it('refuses a negative count', () => {
    expect(
      closeProblem({ closeDate: TODAY, lastCloseDate: null, countedAmount: -1, today: TODAY }),
    ).toMatch(/less than nothing/);
  });

  it('accepts a genuinely empty drawer', () => {
    expect(
      closeProblem({ closeDate: TODAY, lastCloseDate: null, countedAmount: 0, today: TODAY }),
    ).toBeNull();
  });
});

describe('varianceVerdict', () => {
  it('ignores rounding', () => {
    expect(varianceVerdict(0)).toBe('BALANCED');
    expect(varianceVerdict(-1)).toBe('BALANCED');
    expect(varianceVerdict(0.5)).toBe('BALANCED');
  });

  it('calls a shortfall short and an excess over', () => {
    expect(varianceVerdict(-250)).toBe('SHORT');
    expect(varianceVerdict(250)).toBe('OVER');
  });

  it('takes a tolerance of its own', () => {
    expect(varianceVerdict(-40, 50)).toBe('BALANCED');
    expect(varianceVerdict(-40, 10)).toBe('SHORT');
  });
});

describe('handoverPlan', () => {
  it('hands over everything above the float, rounded to a note', () => {
    expect(handoverPlan(102500, 2500)).toEqual({ handover: 100000, retained: 2500 });
  });

  it('rounds down so the drawer is not left counting coins', () => {
    // 102,487 less a 2,500 float is 99,987 — hand over 99,900 and keep the rest.
    expect(handoverPlan(102487, 2500)).toEqual({ handover: 99900, retained: 2587 });
  });

  it('keeps the lot when the count is at or below the float', () => {
    expect(handoverPlan(2500, 2500)).toEqual({ handover: 0, retained: 2500 });
    expect(handoverPlan(1800, 2500)).toEqual({ handover: 0, retained: 1800 });
  });

  it('hands over everything when no float is kept', () => {
    expect(handoverPlan(50000, 0)).toEqual({ handover: 50000, retained: 0 });
  });

  it('always leaves the float plus the rounding remainder', () => {
    const { handover, retained } = handoverPlan(77777, 5000);
    expect(handover + retained).toBe(77777);
    expect(retained).toBeGreaterThanOrEqual(5000);
  });

  it('takes a rounding step of its own', () => {
    expect(handoverPlan(102487, 2500, 500)).toEqual({ handover: 99500, retained: 2987 });
    expect(handoverPlan(102487, 2500, 1)).toEqual({ handover: 99987, retained: 2500 });
  });

  it('treats a negative float as none', () => {
    expect(handoverPlan(5000, -100)).toEqual({ handover: 5000, retained: 0 });
  });
});

describe('handoverProblem', () => {
  it('is fine when nothing is handed over', () => {
    expect(handoverProblem(0, 5000, null)).toBeNull();
  });

  it('refuses more than was counted', () => {
    expect(handoverProblem(6000, 5000, 'owner-1')).toMatch(/all there is/);
  });

  it('insists somebody is taking it', () => {
    expect(handoverProblem(1000, 5000, null)).toMatch(/who is taking/);
  });

  it('accepts a handover of the whole drawer to a named owner', () => {
    expect(handoverProblem(5000, 5000, 'owner-1')).toBeNull();
  });
});

describe('adjustmentFor', () => {
  it('takes money out of the book when the drawer is short', () => {
    expect(adjustmentFor(-250)).toEqual({ direction: 'OUT', amount: 250 });
  });

  it('puts money in when the drawer holds more than the book says', () => {
    expect(adjustmentFor(250)).toEqual({ direction: 'IN', amount: 250 });
  });

  it('writes nothing when the two agree', () => {
    expect(adjustmentFor(0)).toBeNull();
    expect(adjustmentFor(0.001)).toBeNull();
  });
});
