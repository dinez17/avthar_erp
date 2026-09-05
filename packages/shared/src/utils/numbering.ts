/**
 * The Indian financial year a date falls in, as it is written on a document: "26-27".
 *
 * The year turns on 1 April. A date in March belongs to the year that started the
 * previous April, which is why this cannot be derived from the calendar year alone —
 * and why an invoice raised on 31 March and one raised on 1 April sit in different
 * series despite being a day apart.
 */
export function financialYearOf(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  const two = (value: number): string => String(value % 100).padStart(2, '0');
  return `${two(startYear)}-${two(startYear + 1)}`;
}

/** The first day of the financial year a date falls in. */
export function financialYearStart(date: Date): Date {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(year, 3, 1, 0, 0, 0, 0);
}

export interface NumberFormat {
  prefix: string;
  /** What sits between the parts. Usually "/" or "-". */
  separator: string;
  /** How many digits the running number is padded to. */
  padding: number;
  /** Whether the financial year appears, and the count starts again each April. */
  resetAnnually: boolean;
}

export const DEFAULT_NUMBER_FORMAT: Omit<NumberFormat, 'prefix'> = {
  separator: '/',
  padding: 4,
  resetAnnually: true,
};

/**
 * Builds a document number from its parts.
 *
 * Composed rather than templated on purpose: a free-form pattern is one typo away from
 * two branches sharing a series, and a duplicate invoice number is not a thing you can
 * quietly fix afterwards.
 */
export function formatDocumentNumber(
  format: NumberFormat,
  sequence: number,
  financialYear: string | null,
): string {
  const parts = [format.prefix.trim()];
  if (format.resetAnnually && financialYear) parts.push(financialYear);
  parts.push(String(Math.max(sequence, 0)).padStart(Math.max(format.padding, 1), '0'));
  return parts.filter(Boolean).join(format.separator);
}

/** What the next number will look like, for a settings screen to show while typing. */
export function previewDocumentNumber(format: NumberFormat, at: Date = new Date()): string {
  return formatDocumentNumber(format, 1, financialYearOf(at));
}

/**
 * Whether a prefix is usable.
 *
 * Letters, digits, spaces and a few separators only. A prefix carrying a slash of its own
 * would produce numbers that cannot be told apart from the separator, and one carrying
 * whitespace at the ends reads as a different series to a human and the same to a
 * database.
 */
export function isValidPrefix(prefix: string): boolean {
  const trimmed = prefix.trim();
  if (trimmed.length === 0 || trimmed.length > 12) return false;
  if (trimmed !== prefix) return false;
  return /^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(trimmed);
}
