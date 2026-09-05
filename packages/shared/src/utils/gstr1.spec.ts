import type { Gstr1Return } from '@tiles-erp/shared-types';
import { GSTR1_SECTIONS, columnLetter, summarise } from './gstr1';

const sample: Gstr1Return = {
  fromDate: '2026-08-01T00:00:00.000Z',
  toDate: '2026-08-31T00:00:00.000Z',
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
    {
      // Same invoice, second rate — one recipient, one invoice, two rows.
      gstin: '33AABCT1234H1Z5',
      receiverName: 'Karthik Traders',
      invoiceNumber: 'SI/2026/0001',
      invoiceDate: '05-08-2026',
      invoiceValue: 11800,
      placeOfSupply: '33',
      reverseCharge: 'N',
      invoiceType: 'Regular B2B',
      rate: 5,
      taxableValue: 4000,
      cessAmount: 0,
    },
  ],
  b2cl: [],
  b2cs: [],
  hsnB2b: [],
  hsnB2c: [],
  docs: [],
};

const sectionFor = (key: string) => GSTR1_SECTIONS.find((section) => section.key === key)!;

describe('columnLetter', () => {
  it('numbers spreadsheet columns from A', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(12)).toBe('M');
    expect(columnLetter(25)).toBe('Z');
  });

  it('carries past Z the way a spreadsheet does', () => {
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(27)).toBe('AB');
    expect(columnLetter(51)).toBe('AZ');
    expect(columnLetter(52)).toBe('BA');
  });
});

describe('summarise', () => {
  const section = sectionFor('b2b');
  const rows = section.rows(sample);

  it('counts a recipient once however many rows they have', () => {
    const recipients = section.summary.find((s) => s.label === 'No. of Recipients')!;
    expect(summarise(recipients, rows)).toBe(1);
  });

  it('counts an invoice once even when it is split across tax rates', () => {
    const invoices = section.summary.find((s) => s.label === 'No. of Invoices')!;
    expect(summarise(invoices, rows)).toBe(1);
  });

  it('adds a column up', () => {
    const taxable = section.summary.find((s) => s.label === 'Total Taxable Value')!;
    expect(summarise(taxable, rows)).toBe(14000);
  });

  it('reads an empty section as zero rather than failing', () => {
    for (const each of GSTR1_SECTIONS) {
      for (const summary of each.summary) {
        expect(summarise(summary, [])).toBe(0);
      }
    }
  });

  it('ignores the blank columns the tool fills in itself', () => {
    expect(summarise({ label: '', column: 0, kind: 'total', lastRow: 10 }, [[''], [null]])).toBe(0);
    expect(summarise({ label: '', column: 0, kind: 'count', lastRow: 10 }, [[''], [null]])).toBe(0);
  });
});

describe('GSTR1_SECTIONS', () => {
  it('points every summary at a column the section actually has', () => {
    for (const section of GSTR1_SECTIONS) {
      for (const summary of section.summary) {
        expect(section.headers[summary.column]).toBeDefined();
      }
    }
  });

  it('produces a row exactly as wide as its headers', () => {
    for (const section of GSTR1_SECTIONS) {
      for (const row of section.rows(sample)) {
        expect(row).toHaveLength(section.headers.length);
      }
    }
  });
});
