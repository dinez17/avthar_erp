import type { Gstr1Return } from '@tiles-erp/shared-types';
import type { CsvValue } from './csv';

/**
 * One section of the return, described exactly as the GST offline tool's workbook
 * expects it.
 *
 * The tool reads its sheets positionally, so the header strings and the column order
 * below are not cosmetic — they are the contract. They live here, in one place, because
 * the API writes them into the workbook and the web app writes the same columns into a
 * per-section CSV; two copies would drift and the drift would only surface at the point
 * of filing.
 */
export interface Gstr1Section {
  /** The key on `Gstr1Return` this section reads. */
  key: Gstr1SectionKey;
  /** The worksheet name the offline tool looks for. */
  sheet: string;
  /** What the section is called on screen. */
  label: string;
  /** The title written above the headers. */
  title: string;
  headers: string[];
  /** The band above the headers: what the sheet totals, and over which column. */
  summary: Gstr1Summary[];
  /** Turns the return into the section's rows, in header order. */
  rows: (data: Gstr1Return) => CsvValue[][];
}

export type Gstr1SectionKey = 'b2b' | 'b2cl' | 'b2cs' | 'hsnB2b' | 'hsnB2c' | 'docs';

/**
 * One figure in a sheet's summary band.
 *
 * The template states these as Excel formulas. Describing them instead — what is being
 * measured, and over which column — lets the workbook write the formula and the screen
 * compute the same figure, without either restating the other's arithmetic.
 */
export interface Gstr1Summary {
  label: string;
  /** Index into `headers`. */
  column: number;
  /** `total` adds the column up; `count` counts the distinct values in it. */
  kind: 'total' | 'count';
  /**
   * The last row the template's own formula reaches, copied from it rather than chosen.
   * A sum runs to the end of the sheet cheaply; the distinct count is a `COUNTIF` over
   * the whole range and is capped, because over a million rows it would hang Excel.
   */
  lastRow: number;
}

/** `0` → `A`, `26` → `AA`. Spreadsheet column names are base-26 with no zero. */
export function columnLetter(index: number): string {
  let letters = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
  }
  return letters;
}

/** The value the sheet's formula would show, computed from the rows themselves. */
export function summarise(summary: Gstr1Summary, rows: CsvValue[][]): number {
  const values = rows.map((row) => row[summary.column]);
  if (summary.kind === 'count') {
    return new Set(
      values.filter((value) => value !== null && value !== undefined && value !== ''),
    ).size;
  }
  return values.reduce<number>(
    (total, value) => total + (typeof value === 'number' && Number.isFinite(value) ? value : 0),
    0,
  );
}

const total = (label: string, column: number, lastRow = 1048576): Gstr1Summary => ({
  label,
  column,
  kind: 'total',
  lastRow,
});

const count = (label: string, column: number, lastRow = 20004): Gstr1Summary => ({
  label,
  column,
  kind: 'count',
  lastRow,
});

const HSN_HEADERS = [
  'HSN',
  'Description',
  'UQC',
  'Total Quantity',
  'Total Value',
  'Rate',
  'Taxable Value',
  'Integrated Tax Amount',
  'Central Tax Amount',
  'State/UT Tax Amount',
  'Cess Amount',
];

/** The HSN sheets cap every formula at row 2000, both of them identically. */
const HSN_SUMMARY: Gstr1Summary[] = [
  count('No. of HSN', 0, 2000),
  total('Total Value', 4, 2000),
  total('Total Taxable Value', 6, 2000),
  total('Total Integrated Tax', 7, 2000),
  total('Total Central Tax', 8, 2000),
  total('Total State/UT Tax', 9, 2000),
  total('Total Cess', 10, 2000),
];

const hsnRows = (key: 'hsnB2b' | 'hsnB2c') => (data: Gstr1Return): CsvValue[][] =>
  data[key].map((row) => [
    row.hsn,
    row.description,
    row.uqc,
    row.totalQuantity,
    row.totalValue,
    row.rate,
    row.taxableValue,
    row.integratedTax,
    row.centralTax,
    row.stateTax,
    row.cessAmount,
  ]);

export const GSTR1_SECTIONS: readonly Gstr1Section[] = [
  {
    key: 'b2b',
    sheet: 'b2b,sez,de',
    label: 'B2B — registered customers (4A, 4B, 6B, 6C)',
    title: 'Summary For B2B, SEZ, DE (4A, 4B, 6B, 6C)',
    headers: [
      'GSTIN/UIN of Recipient',
      'Receiver Name',
      'Invoice Number',
      'Invoice date',
      'Invoice Value',
      'Place Of Supply',
      'Reverse Charge',
      'Applicable % of Tax Rate',
      'Invoice Type',
      'E-Commerce GSTIN',
      'Rate',
      'Taxable Value',
      'Cess Amount',
    ],
    summary: [
      count('No. of Recipients', 0),
      count('No. of Invoices', 2),
      total('Total Invoice Value', 4),
      total('Total Taxable Value', 11),
      total('Total Cess', 12),
    ],
    rows: (data) =>
      data.b2b.map((row) => [
        row.gstin,
        row.receiverName,
        row.invoiceNumber,
        row.invoiceDate,
        row.invoiceValue,
        row.placeOfSupply,
        row.reverseCharge,
        '',
        row.invoiceType,
        '',
        row.rate,
        row.taxableValue,
        row.cessAmount,
      ]),
  },
  {
    key: 'b2cl',
    sheet: 'b2cl',
    label: 'B2CL — large inter-state, unregistered (5)',
    title: 'Summary For B2CL(5)',
    headers: [
      'Invoice Number',
      'Invoice date',
      'Invoice Value',
      'Place Of Supply',
      'Applicable % of Tax Rate',
      'Rate',
      'Taxable Value',
      'Cess Amount',
      'E-Commerce GSTIN',
    ],
    summary: [
      count('No. of Invoices', 0),
      total('Total Invoice Value', 2),
      total('Total Taxable Value', 6),
      total('Total Cess', 7),
    ],
    rows: (data) =>
      data.b2cl.map((row) => [
        row.invoiceNumber,
        row.invoiceDate,
        row.invoiceValue,
        row.placeOfSupply,
        '',
        row.rate,
        row.taxableValue,
        row.cessAmount,
        '',
      ]),
  },
  {
    key: 'b2cs',
    sheet: 'b2cs',
    label: 'B2CS — small unregistered, totalled (7)',
    title: 'Summary For B2CS(7)',
    headers: [
      'Type',
      'Place Of Supply',
      'Applicable % of Tax Rate',
      'Rate',
      'Taxable Value',
      'Cess Amount',
      'E-Commerce GSTIN',
    ],
    // The template spells this label with two spaces. Left as it is: the sheet is read
    // positionally, so a "corrected" label would only disagree with the tool's own.
    summary: [total('Total Taxable  Value', 4), total('Total Cess', 5)],
    rows: (data) =>
      data.b2cs.map((row) => [
        row.type,
        row.placeOfSupply,
        '',
        row.rate,
        row.taxableValue,
        row.cessAmount,
        '',
      ]),
  },
  {
    key: 'hsnB2b',
    sheet: 'hsn(b2b)',
    label: 'HSN — B2B supplies (12)',
    title: 'Summary For HSN(12)',
    headers: HSN_HEADERS,
    summary: HSN_SUMMARY,
    rows: hsnRows('hsnB2b'),
  },
  {
    key: 'hsnB2c',
    sheet: 'hsn(b2c)',
    label: 'HSN — B2C supplies (12)',
    title: 'Summary For HSN(12)',
    headers: HSN_HEADERS,
    summary: HSN_SUMMARY,
    rows: hsnRows('hsnB2c'),
  },
  {
    key: 'docs',
    sheet: 'docs',
    label: 'Documents issued (13)',
    title: 'Summary of documents issued during the tax period (13)',
    headers: ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
    summary: [total('Total Number', 3), total('Total Cancelled', 4)],
    rows: (data) =>
      data.docs.map((row) => [
        row.natureOfDocument,
        row.serialFrom,
        row.serialTo,
        row.totalNumber,
        row.cancelled,
      ]),
  },
];
