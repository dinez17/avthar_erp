import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { Button, Stack } from '@mui/material';
import { useState } from 'react';
import type { Paginated } from '@tiles-erp/shared-types';
import { apiFetch } from '../lib/api-client';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  width?: number;
}

interface Props<T> {
  path: string;
  params: Record<string, string | undefined>;
  columns: ExportColumn<T>[];
  title: string;
  filename: string;
  onError: (message: string) => void;
  /** Optional final rows, built from the complete filtered result (for report totals). */
  footerRows?: (rows: T[]) => Array<Array<string | number | null | undefined>>;
}

const escapeXml = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const save = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export async function fetchAllListRows<T>(path: string, filters: Record<string, string | undefined>): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let pages = 1;
  do {
    const params = new URLSearchParams({ page: String(page), pageSize: '100' });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const result = await apiFetch<Paginated<T>>(`${path}?${params.toString()}`);
    rows.push(...result.items);
    pages = result.meta.totalPages;
    page += 1;
  } while (page <= pages);
  return rows;
}

function excel<T>(title: string, columns: ExportColumn<T>[], rows: T[], footerRows: Array<Array<string | number | null | undefined>> = []): Blob {
  const cells = (values: Array<string | number | null | undefined>, header = false): string =>
    `<Row>${values.map((raw) => {
      const value = raw ?? '';
      const number = typeof value === 'number' && Number.isFinite(value);
      const style = header ? ' ss:StyleID="Header"' : '';
      return `<Cell${style}><Data ss:Type="${number ? 'Number' : 'String'}">${escapeXml(String(value))}</Data></Cell>`;
    }).join('')}</Row>`;
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D9E2F3" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="${escapeXml(title.slice(0, 31))}"><Table>
${columns.map((column) => `<Column ss:Width="${column.width ?? 110}"/>`).join('')}
${cells(columns.map((column) => column.header), true)}
${rows.map((row) => cells(columns.map((column) => column.value(row)))).join('\n')}
${footerRows.map((row) => cells(row, true)).join('\n')}
</Table></Worksheet></Workbook>`;
  return new Blob(['\ufeff', xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
}

const pdfText = (value: unknown): string => String(value ?? '')
  .normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replaceAll('\\', '\\\\')
  .replaceAll('(', '\\(').replaceAll(')', '\\)');

/** Small dependency-free PDF writer for landscape list reports. */
function pdf<T>(title: string, columns: ExportColumn<T>[], rows: T[], footerRows: Array<Array<string | number | null | undefined>> = []): Blob {
  const pageWidth = 842;
  const left = 28;
  const usable = pageWidth - left * 2;
  const weights = columns.map((column) => column.width ?? 110);
  const totalWeight = weights.reduce((sum, width) => sum + width, 0);
  const widths = weights.map((width) => usable * width / totalWeight);
  const rowHeight = 16;
  const perPage = 31;
  const printableRows: Array<{ values: unknown[]; footer: boolean }> = [
    ...rows.map((row) => ({ values: columns.map((column) => column.value(row)), footer: false })),
    ...footerRows.map((values) => ({ values, footer: true })),
  ];
  const pages = Array.from({ length: Math.max(1, Math.ceil(printableRows.length / perPage)) }, (_, index) =>
    printableRows.slice(index * perPage, (index + 1) * perPage));
  const objects: string[] = [];
  const add = (body: string): number => { objects.push(body); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];

  for (const pageRows of pages) {
    const commands: string[] = [
      'BT /F1 15 Tf 28 565 Td', `(${pdfText(title)}) Tj ET`,
      'BT /F1 8 Tf 700 565 Td', `(Exported ${pdfText(new Date().toLocaleString('en-IN'))}) Tj ET`,
    ];
    let y = 540;
    const drawRow = (values: unknown[], header: boolean): void => {
      let x = left;
      commands.push(
        `${header ? '0.88 0.92 0.98' : '1 1 1'} rg ${left} ${y - 3} ${usable} ${rowHeight} re f`,
        '0 g',
        '0.75 G',
      );
      for (let i = 0; i < values.length; i += 1) {
        const width = widths[i] ?? 0;
        commands.push(`${x} ${y - 3} ${width} ${rowHeight} re S`);
        const max = Math.max(3, Math.floor(width / 4.8));
        const text = pdfText(values[i]).slice(0, max);
        commands.push(`BT /F1 ${header ? 8 : 7} Tf ${x + 3} ${y + 2} Td (${text}) Tj ET`);
        x += width;
      }
      y -= rowHeight;
    };
    drawRow(columns.map((column) => column.header), true);
    pageRows.forEach((row) => drawRow(row.values, row.footer));
    const stream = commands.join('\n');
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([output], { type: 'application/pdf' });
}

/** Downloads an already-loaded report as a paginated landscape PDF. */
export function downloadTablePdf<T>(
  filename: string,
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  footerRows: Array<Array<string | number | null | undefined>> = [],
): void {
  save(pdf(title, columns, rows, footerRows), filename);
}

/** Downloads an already-loaded report as an Excel-compatible worksheet. */
export function downloadTableExcel<T>(
  filename: string,
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  footerRows: Array<Array<string | number | null | undefined>> = [],
): void {
  save(excel(title, columns, rows, footerRows), filename);
}

export function ListExportButtons<T>({ path, params, columns, title, filename, onError, footerRows }: Props<T>): JSX.Element {
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);
  const run = async (format: 'excel' | 'pdf'): Promise<void> => {
    setBusy(format);
    try {
      const rows = await fetchAllListRows<T>(path, params);
      if (!rows.length) throw new Error('There are no rows to export.');
      const stamp = new Date().toISOString().slice(0, 10);
      const footers = footerRows?.(rows) ?? [];
      save(format === 'excel' ? excel(title, columns, rows, footers) : pdf(title, columns, rows, footers),
        `${filename}-${stamp}.${format === 'excel' ? 'xls' : 'pdf'}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The export could not be created.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Stack direction="row" spacing={1}>
      <Button size="small" variant="outlined" startIcon={<DownloadIcon />} disabled={busy !== null} onClick={() => void run('excel')}>
        {busy === 'excel' ? 'Exporting…' : 'Excel'}
      </Button>
      <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} disabled={busy !== null} onClick={() => void run('pdf')}>
        {busy === 'pdf' ? 'Exporting…' : 'PDF'}
      </Button>
    </Stack>
  );
}
