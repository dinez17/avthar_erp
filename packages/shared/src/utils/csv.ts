/** A cell as it comes out of a report: text, a figure, or nothing at all. */
export type CsvValue = string | number | boolean | null | undefined;

/**
 * Quotes one cell the way RFC 4180 asks for.
 *
 * Excel is the destination for these files, so two of its habits are guarded against:
 * a value containing a comma, quote or newline is wrapped in quotes (with inner quotes
 * doubled), and a value that begins with `=`, `+`, `-` or `@` is prefixed with a quote
 * so the spreadsheet reads it as text rather than a formula. That last case is not
 * cosmetic — an invoice reference such as `-2024/07` would otherwise be evaluated.
 */
const cell = (value: CsvValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  const text = value;
  const risky = /^[=+\-@\t\r]/.test(text);
  const body = risky ? `'${text}` : text;
  return /[",\r\n]/.test(body) ? `"${body.replace(/"/g, '""')}"` : body;
};

/**
 * Renders a header row and its data rows as CSV text.
 *
 * Rows are emitted with CRLF line endings, which is what Excel expects, and the caller
 * is responsible for prefixing a BOM if the data can contain non-ASCII characters —
 * `downloadCsv` in the web app does that.
 */
export const toCsv = (headers: string[], rows: CsvValue[][]): string =>
  [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
