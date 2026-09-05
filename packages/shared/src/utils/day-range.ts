/**
 * Turning a date picker's value into the instant a query actually means.
 *
 * An `<input type="date">` gives back `2026-08-08` — a calendar day with no time and no
 * zone. `new Date('2026-08-08')` reads that as **midnight UTC**, so a report asked for
 * "up to today" silently excluded everything that happened today: in India that is the
 * whole working day, and the report comes back empty for no visible reason.
 *
 * These two read the day in the **browser's own zone**, which is the one the person
 * typing it was thinking in, and stretch it to cover the day end to end.
 */

/** Midnight at the start of that local day, as an instant. */
export function startOfDayIso(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0).toISOString();
}

/** The last millisecond of that local day, so the day itself is included. */
export function endOfDayIso(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999).toISOString();
}

/** A local date as a picker wants it: `yyyy-mm-dd`, never shifted by a zone. */
export function toDateInput(date: Date): string {
  return date.toLocaleDateString('en-CA');
}
