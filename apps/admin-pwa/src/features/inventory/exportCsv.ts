/** Escapes a CSV cell, quoting when it contains a delimiter, quote or newline. */
const cell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Triggers a client-side CSV download for the given rows. */
export function exportCsv<T extends object>(
  filename: string,
  columns: { header: string; field: keyof T | ((row: T) => unknown) }[],
  rows: T[],
): void {
  const header = columns.map((c) => cell(c.header)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => cell(typeof c.field === 'function' ? c.field(row) : row[c.field]))
        .join(','),
    )
    .join('\n');

  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
