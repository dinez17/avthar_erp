/**
 * Turning a date picker's value into the instant a query actually means.
 *
 * An `<input type="date">` gives back `2026-08-08` — a calendar day with no time and no
 * zone. `new Date('2026-08-08')` reads that as **midnight UTC**, so a report asked for
 * "up to today" silently excluded everything that happened today: in India that is the
 * whole working day, and the report comes back empty for no visible reason.
 *
 * The ERP's business day is India time. A workstation's display format or time-zone
 * preference must not move a report into the previous or next day.
 */

/** Midnight at the start of that India business day, as an instant. */
export function startOfDayIso(localDate: string): string {
  return new Date(`${localDate}T00:00:00.000+05:30`).toISOString();
}

/** The last millisecond of that India business day, so the day itself is included. */
export function endOfDayIso(localDate: string): string {
  return new Date(`${localDate}T23:59:59.999+05:30`).toISOString();
}

/**
 * A date as an HTML picker requires it: `yyyy-mm-dd`.
 * `toLocaleDateString` is deliberately avoided because its output can follow an end
 * user's OS date format and produce a value that the date input rejects.
 */
export function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
