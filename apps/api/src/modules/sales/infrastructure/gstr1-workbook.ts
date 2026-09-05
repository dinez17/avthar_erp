import ExcelJS from 'exceljs';
import { GSTR1_SECTIONS, columnLetter, type Gstr1Section, type Gstr1Summary } from '@tiles-erp/shared';
import type { Gstr1Return } from '@tiles-erp/shared-types';

/**
 * The Excel formula behind one summary figure.
 *
 * `SUMPRODUCT((A5:A20004<>"")/COUNTIF(...))` is the template's own way of counting
 * distinct values, kept verbatim rather than simplified — the tool reads the cell's
 * result, but a filer opening the workbook expects to see the formula they know.
 */
const formulaFor = (summary: Gstr1Summary): string => {
  const column = columnLetter(summary.column);
  const range = `${column}5:${column}${summary.lastRow}`;
  return summary.kind === 'total'
    ? `SUM(${range})`
    : `SUMPRODUCT((${range}<>"")/COUNTIF(${range},${range}&""))`;
};

/**
 * Writes one sheet in the layout the offline tool reads positionally:
 *
 * ```
 * row 1  title, then the word HELP
 * row 2  summary labels
 * row 3  summary formulas
 * row 4  column headers
 * row 5+ data
 * ```
 *
 * A row out of place makes the upload fail, so the shape is described once here rather
 * than being rebuilt per section.
 */
const writeSheet = (workbook: ExcelJS.Workbook, section: Gstr1Section, data: Gstr1Return): void => {
  const sheet = workbook.addWorksheet(section.sheet);

  sheet.getRow(1).values = [section.title, 'HELP'];
  sheet.getRow(1).font = { bold: true, size: 12 };
  sheet.getRow(2).values = section.summary.map((summary) => summary.label);
  sheet.getRow(2).font = { bold: true };
  sheet.getRow(3).values = section.summary.map((summary) => ({ formula: formulaFor(summary) }));
  sheet.getRow(4).values = section.headers;
  sheet.getRow(4).font = { bold: true };
  sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

  section.rows(data).forEach((row, index) => {
    // A blank cell must stay blank: `null` would be written as a value the tool rejects.
    sheet.getRow(5 + index).values = row.map((value) => value ?? '');
  });

  section.headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = Math.max(header.length + 4, 14);
  });
};

/**
 * Builds the GSTR-1 workbook the offline tool accepts. Only the sheets that can be
 * filled from sales data are written; the tool does not mind the others being absent.
 */
export async function buildGstr1Workbook(data: Gstr1Return): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tiles ERP';
  workbook.created = new Date();

  for (const section of GSTR1_SECTIONS) {
    writeSheet(workbook, section, data);
  }

  // exceljs types the result as its own Buffer; the bytes are what the response needs.
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
