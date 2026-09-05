import { endOfDayIso, startOfDayIso, toDateInput } from './day-range';

describe('startOfDayIso / endOfDayIso', () => {
  it('covers the whole of the day it is given', () => {
    const start = new Date(startOfDayIso('2026-08-08'));
    const end = new Date(endOfDayIso('2026-08-08'));

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(8);
    expect(start.getHours()).toBe(0);

    expect(end.getDate()).toBe(8);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('ends after it starts, by just under a day', () => {
    const span =
      new Date(endOfDayIso('2026-08-08')).getTime() - new Date(startOfDayIso('2026-08-08')).getTime();
    expect(span).toBe(24 * 60 * 60 * 1000 - 1);
  });

  /**
   * The bug these exist for: `new Date('2026-08-08')` is midnight UTC, which is earlier
   * than midnight local anywhere east of Greenwich — so anything that happened that
   * morning fell outside a range ending "today".
   */
  it('includes something that happened during the day, which a bare parse would not', () => {
    const middayLocal = new Date(2026, 7, 8, 12, 0, 0);
    expect(middayLocal.getTime()).toBeLessThanOrEqual(new Date(endOfDayIso('2026-08-08')).getTime());
    expect(middayLocal.getTime()).toBeGreaterThanOrEqual(
      new Date(startOfDayIso('2026-08-08')).getTime(),
    );
  });

  it('handles a month and year boundary', () => {
    expect(new Date(startOfDayIso('2026-01-01')).getMonth()).toBe(0);
    expect(new Date(endOfDayIso('2026-12-31')).getDate()).toBe(31);
  });
});

describe('toDateInput', () => {
  it('gives the local calendar day, not the UTC one', () => {
    expect(toDateInput(new Date(2026, 7, 8, 23, 30))).toBe('2026-08-08');
    expect(toDateInput(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });

  it('round-trips through startOfDayIso', () => {
    expect(toDateInput(new Date(startOfDayIso('2026-08-08')))).toBe('2026-08-08');
  });
});
