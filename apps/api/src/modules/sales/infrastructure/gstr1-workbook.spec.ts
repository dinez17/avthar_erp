import ExcelJS from 'exceljs';
import type { Gstr1Return } from '@tiles-erp/shared-types';
import { buildGstr1Workbook } from './gstr1-workbook';

const emptyReturn: Gstr1Return = {
  fromDate: '2026-08-01T00:00:00.000Z',
  toDate: '2026-08-31T00:00:00.000Z',
  b2b: [],
  b2cl: [],
  b2cs: [],
  hsnB2b: [],
  hsnB2c: [],
  docs: [],
};

const sample: Gstr1Return = {
  ...emptyReturn,
  b2b: [
    {
      gstin: '33AABCT1234H1Z5',
      receiverName: 'Karthik Traders',
      invoiceNumber: 'SI/2026/0001',
      invoiceDate: '05-08-2026',
      invoiceValue: 11800,
      placeOfSupply: '33',
      reverseCharge: 'N',
      invoiceType: 'Regular B2B',
      rate: 18,
      taxableValue: 10000,
      cessAmount: 0,
    },
  ],
  b2cs: [{ type: 'OE', placeOfSupply: '33', rate: 18, taxableValue: 5000, cessAmount: 0 }],
  docs: [
    {
      natureOfDocument: 'Invoices for outward supply',
      serialFrom: 'SI/2026/0001',
      serialTo: 'SI/2026/0009',
      totalNumber: 9,
      cancelled: 1,
    },
  ],
};

/** Reads the workbook back the way the offline tool would: by position. */
async function read(data: Gstr1Return): Promise<ExcelJS.Workbook> {
  const bytes = await buildGstr1Workbook(data);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  return workbook;
}

const cells = (sheet: ExcelJS.Worksheet, row: number): unknown[] =>
  (sheet.getRow(row).values as unknown[]).slice(1);

describe('buildGstr1Workbook', () => {
  it('writes every sheet the offline tool reads', async () => {
    const workbook = await read(sample);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'b2b,sez,de',
      'b2cl',
      'b2cs',
      'hsn(b2b)',
      'hsn(b2c)',
      'docs',
    ]);
  });

  it('keeps the fixed layout: title, summary, formulas, headers, then data', async () => {
    const sheet = (await read(sample)).getWorksheet('b2b,sez,de')!;

    expect(cells(sheet, 1)).toEqual(['Summary For B2B, SEZ, DE (4A, 4B, 6B, 6C)', 'HELP']);
    expect(cells(sheet, 2)[0]).toBe('No. of Recipients');
    expect((sheet.getCell('C3').value as { formula: string }).formula).toBe('SUM(E5:E1048576)');
    expect(cells(sheet, 4)[0]).toBe('GSTIN/UIN of Recipient');
    expect(cells(sheet, 5)[0]).toBe('33AABCT1234H1Z5');
  });

  it('writes each column where its header says, leaving the unused ones blank', async () => {
    const sheet = (await read(sample)).getWorksheet('b2b,sez,de')!;
    const headers = cells(sheet, 4) as string[];
    const row = cells(sheet, 5);

    expect(row[headers.indexOf('Invoice Value')]).toBe(11800);
    expect(row[headers.indexOf('Taxable Value')]).toBe(10000);
    expect(row[headers.indexOf('Reverse Charge')]).toBe('N');
    // The tool fills these in itself; an empty cell is correct, a zero would not be.
    expect(row[headers.indexOf('E-Commerce GSTIN')]).toBe('');
  });

  it('still writes the headers when a section has nothing in it', async () => {
    const sheet = (await read(emptyReturn)).getWorksheet('docs')!;
    expect(cells(sheet, 4)).toEqual([
      'Nature of Document',
      'Sr. No. From',
      'Sr. No. To',
      'Total Number',
      'Cancelled',
    ]);
    expect(sheet.getRow(5).values).toEqual([]);
  });

  it('carries the cancelled count into the documents sheet', async () => {
    const sheet = (await read(sample)).getWorksheet('docs')!;
    expect(cells(sheet, 5)).toEqual([
      'Invoices for outward supply',
      'SI/2026/0001',
      'SI/2026/0009',
      9,
      1,
    ]);
  });
});
