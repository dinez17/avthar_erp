import { endOfDayIso, startOfDayIso, toDateInput } from './day-range';

describe('startOfDayIso / endOfDayIso', () => {
  it('covers the whole of the day it is given', () => {
    const start = new Date(startOfDayIso('2026-08-08'));
    const end = new Date(endOfDayIso('2026-08-08'));

    expect(start.toISOString()).toBe('2026-08-07T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-08-08T18:29:59.999Z');
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
    const middayInIndia = new Date('2026-08-08T12:00:00.000+05:30');
    expect(middayInIndia.getTime()).toBeLessThanOrEqual(new Date(endOfDayIso('2026-08-08')).getTime());
    expect(middayInIndia.getTime()).toBeGreaterThanOrEqual(
      new Date(startOfDayIso('2026-08-08')).getTime(),
    );
  });

  it('handles a month and year boundary', () => {
    expect(startOfDayIso('2026-01-01')).toBe('2025-12-31T18:30:00.000Z');
    expect(endOfDayIso('2026-12-31')).toBe('2026-12-31T18:29:59.999Z');
  });
});

describe('toDateInput', () => {
  it('gives the local calendar day, not the UTC one', () => {
    expect(toDateInput(new Date(2026, 7, 8, 23, 30))).toBe('2026-08-08');
    expect(toDateInput(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });

  it('does not depend on the operating system date format', () => {
    const locale = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('08/08/2026');
    expect(toDateInput(new Date(2026, 7, 8))).toBe('2026-08-08');
    locale.mockRestore();
  });
});
