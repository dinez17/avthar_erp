import { ValidationError } from '@tiles-erp/shared';
import { resolveWindow } from './dashboard.handlers';

const DAY = 24 * 60 * 60 * 1000;

describe('resolveWindow', () => {
  it('looks back thirty days when no dates are given', () => {
    const { from, to } = resolveWindow();
    const days = Math.round((to.getTime() - from.getTime()) / DAY);
    expect(days).toBe(29);
  });

  it('honours both dates when they are given', () => {
    const { from, to } = resolveWindow('2026-08-01T00:00:00.000Z', '2026-08-07T00:00:00.000Z');
    expect(from.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(to.toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('refuses a window that runs backwards', () => {
    expect(() => resolveWindow('2026-08-07T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toThrow(
      ValidationError,
    );
  });

  it('refuses a window longer than a year', () => {
    expect(() => resolveWindow('2024-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toThrow(
      /a year or less/,
    );
  });

  it('refuses dates it cannot read', () => {
    expect(() => resolveWindow('not-a-date')).toThrow(/could not be read/);
  });
});
