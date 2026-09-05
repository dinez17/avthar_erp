import type { PrismaService } from '../../../core/prisma/prisma.service';
import { PrismaGstr1Repository } from './prisma-gstr1.repository';

interface InvoiceStub {
  invoiceNumber: string;
  invoiceDate: Date;
  status: string;
  customerName: string;
  customerGstin: string | null;
  placeOfSupply: string | null;
  grandTotal: number;
  igstAmount: number;
  branch: { stateCode: string | null };
  lines: {
    hsnCode: string | null;
    qtyBoxes: number;
    gstRate: number;
    lineSubTotal: number;
    lineCgst: number;
    lineSgst: number;
    lineIgst: number;
    lineGst: number;
    lineTotal: number;
    product: { name: string; baseUom: string };
  }[];
}

/** A single-line invoice, taxed intra-state unless an IGST amount is given. */
function invoice(overrides: Partial<InvoiceStub> = {}): InvoiceStub {
  const taxable = 10000;
  return {
    invoiceNumber: 'SI/2026/0001',
    invoiceDate: new Date(2026, 7, 5),
    status: 'POSTED',
    customerName: 'Karthik Traders',
    customerGstin: null,
    placeOfSupply: '33',
    grandTotal: 11800,
    igstAmount: 0,
    branch: { stateCode: '33' },
    lines: [
      {
        hsnCode: '6907',
        qtyBoxes: 10,
        gstRate: 18,
        lineSubTotal: taxable,
        lineCgst: 900,
        lineSgst: 900,
        lineIgst: 0,
        lineGst: 1800,
        lineTotal: 11800,
        product: { name: 'Vitrified 600x600 Black', baseUom: 'BOX' },
      },
    ],
    ...overrides,
  };
}

function repositoryOver(invoices: InvoiceStub[]): PrismaGstr1Repository {
  const prisma = {
    salesInvoice: { findMany: jest.fn().mockResolvedValue(invoices) },
  } as unknown as PrismaService;
  return new PrismaGstr1Repository(prisma);
}

const window = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) };

describe('PrismaGstr1Repository', () => {
  it('reports a customer with a GSTIN as B2B, dated the way the tool reads dates', async () => {
    const data = await repositoryOver([
      invoice({ customerGstin: '33AABCT1234H1Z5' }),
    ]).returnData(window);

    expect(data.b2b).toHaveLength(1);
    expect(data.b2b[0]).toMatchObject({
      gstin: '33AABCT1234H1Z5',
      invoiceDate: '05-08-2026',
      rate: 18,
      taxableValue: 10000,
      invoiceType: 'Regular B2B',
    });
    expect(data.b2cs).toHaveLength(0);
  });

  it('reports a large inter-state sale to an unregistered buyer as B2CL', async () => {
    const data = await repositoryOver([
      invoice({
        igstAmount: 54000,
        placeOfSupply: '29',
        grandTotal: 354000,
        lines: [{ ...invoice().lines[0]!, lineSubTotal: 300000, lineIgst: 54000, lineCgst: 0, lineSgst: 0 }],
      }),
    ]).returnData(window);

    expect(data.b2cl).toHaveLength(1);
    expect(data.b2cl[0]).toMatchObject({ placeOfSupply: '29', taxableValue: 300000 });
    expect(data.b2cs).toHaveLength(0);
  });

  it('keeps a small inter-state sale in B2CS — the threshold is on the invoice value', async () => {
    const data = await repositoryOver([
      invoice({ igstAmount: 1800, placeOfSupply: '29' }),
    ]).returnData(window);

    expect(data.b2cl).toHaveLength(0);
    expect(data.b2cs).toHaveLength(1);
  });

  it('totals B2CS by place and rate rather than listing the invoices', async () => {
    const data = await repositoryOver([
      invoice({ invoiceNumber: 'SI/2026/0001' }),
      invoice({ invoiceNumber: 'SI/2026/0002' }),
    ]).returnData(window);

    expect(data.b2cs).toEqual([
      { type: 'OE', placeOfSupply: '33', rate: 18, taxableValue: 20000, cessAmount: 0 },
    ]);
  });

  it('splits one invoice into a row per tax rate', async () => {
    const line = invoice().lines[0]!;
    const data = await repositoryOver([
      invoice({
        customerGstin: '33AABCT1234H1Z5',
        lines: [line, { ...line, gstRate: 5, lineSubTotal: 4000 }],
      }),
    ]).returnData(window);

    expect(data.b2b.map((row) => [row.rate, row.taxableValue])).toEqual([
      [18, 10000],
      [5, 4000],
    ]);
  });

  it('keeps B2B and B2C HSN totals apart', async () => {
    const data = await repositoryOver([
      invoice({ customerGstin: '33AABCT1234H1Z5' }),
      invoice({ invoiceNumber: 'SI/2026/0002' }),
    ]).returnData(window);

    expect(data.hsnB2b).toHaveLength(1);
    expect(data.hsnB2c).toHaveLength(1);
    expect(data.hsnB2b[0]).toMatchObject({ hsn: '6907', uqc: 'BOX-BOXES', totalQuantity: 10 });
  });

  it('leaves a cancelled invoice out of the supplies but counts it in the document series', async () => {
    const data = await repositoryOver([
      invoice({ invoiceNumber: 'SI/2026/0001' }),
      invoice({ invoiceNumber: 'SI/2026/0002', status: 'CANCELLED' }),
    ]).returnData(window);

    expect(data.b2cs[0]!.taxableValue).toBe(10000);
    expect(data.docs[0]).toMatchObject({
      serialFrom: 'SI/2026/0001',
      serialTo: 'SI/2026/0002',
      totalNumber: 2,
      cancelled: 1,
    });
  });

  it('falls back to the branch state when an invoice carries no place of supply', async () => {
    const data = await repositoryOver([
      invoice({ placeOfSupply: null, branch: { stateCode: '33' } }),
    ]).returnData(window);

    expect(data.b2cs[0]!.placeOfSupply).toBe('33');
  });
});
