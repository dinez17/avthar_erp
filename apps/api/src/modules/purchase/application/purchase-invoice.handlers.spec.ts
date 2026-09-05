import { apportionCharge, ConflictError, ValidationError } from '@tiles-erp/shared';
import {
  CreatePurchaseInvoiceCommand,
  CreatePurchaseInvoiceHandler,
} from './purchase-invoice.handlers';
import type { PurchaseInvoiceRepository } from '../domain/purchase-invoice.repository';
import type { PurchaseOrderRepository } from '../domain/purchase-order.repository';
import type { PurchaseInvoiceItem } from '@tiles-erp/shared-types';

const invoiceRepo = (): jest.Mocked<PurchaseInvoiceRepository> => ({
  nextInvoiceNumber: jest.fn().mockResolvedValue('PINV-2026-00001'),
  supplierInvoiceExists: jest.fn().mockResolvedValue(false),
  invoiceForReceipt: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({ id: 'inv1' } as PurchaseInvoiceItem),
  update: jest.fn().mockResolvedValue({ id: 'inv1' } as PurchaseInvoiceItem),
  post: jest.fn(),
  list: jest.fn(),
  findById: jest.fn(),
  rateHistory: jest.fn(),
  supplierTermDays: jest.fn().mockResolvedValue(30),
});

const orderRepo = (): jest.Mocked<PurchaseOrderRepository> => ({
  nextPoNumber: jest.fn(),
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setStatus: jest.fn(),
  assertReferences: jest.fn().mockResolvedValue(undefined),
  productGstRates: jest.fn().mockResolvedValue(
    new Map([
      ['p1', { gstRate: 18, sku: 'SKU-1' }],
      ['p2', { gstRate: 18, sku: 'SKU-2' }],
    ]),
  ),
});

const base = { supplierInvoiceNo: 'INV-8842', supplierId: 's1', branchId: 'b1' };

describe('apportionCharge', () => {
  it('splits a charge in proportion to line value', () => {
    expect(apportionCharge([8000, 2000], 1000)).toEqual([800, 200]);
  });

  it('returns zeros when there is nothing to apportion', () => {
    expect(apportionCharge([100, 200], 0)).toEqual([0, 0]);
  });
});

describe('CreatePurchaseInvoiceHandler', () => {
  it('folds apportioned charges into each line landing cost', async () => {
    const invoices = invoiceRepo();
    const handler = new CreatePurchaseInvoiceHandler(invoices, orderRepo());

    await handler.execute(
      new CreatePurchaseInvoiceCommand(
        {
          ...base,
          transportCharge: 1180,
          lines: [{ productId: 'p1', qtyBoxes: 100, rate: 100 }],
        },
        'actor',
      ),
    );

    const [data] = invoices.create.mock.calls[0]!;
    // 100 boxes @ 100 = 10,000 + 18% GST = 11,800; plus 1,180 transport = 12,980 / 100
    expect(data.lines[0]!.impliedLandingCost).toBe(129.8);
    expect(data.grandTotal).toBe(11800);
  });

  it('defaults the due date from the supplier payment terms', async () => {
    const invoices = invoiceRepo();
    const handler = new CreatePurchaseInvoiceHandler(invoices, orderRepo());
    await handler.execute(
      new CreatePurchaseInvoiceCommand(
        { ...base, invoiceDate: '2026-01-01T00:00:00.000Z', lines: [{ productId: 'p1', qtyBoxes: 1, rate: 10 }] },
        'actor',
      ),
    );
    const [data] = invoices.create.mock.calls[0]!;
    expect(data.dueDate?.toISOString().slice(0, 10)).toBe('2026-01-31');
  });

  it('rejects a duplicate supplier invoice number', async () => {
    const invoices = invoiceRepo();
    invoices.supplierInvoiceExists.mockResolvedValue(true);
    const handler = new CreatePurchaseInvoiceHandler(invoices, orderRepo());
    await expect(
      handler.execute(
        new CreatePurchaseInvoiceCommand(
          { ...base, lines: [{ productId: 'p1', qtyBoxes: 1, rate: 10 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('requires the supplier invoice number and rejects duplicates lines', async () => {
    const handler = new CreatePurchaseInvoiceHandler(invoiceRepo(), orderRepo());
    await expect(
      handler.execute(
        new CreatePurchaseInvoiceCommand(
          { ...base, supplierInvoiceNo: '  ', lines: [{ productId: 'p1', qtyBoxes: 1, rate: 1 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const line = { productId: 'p1', qtyBoxes: 1, rate: 1 };
    await expect(
      handler.execute(new CreatePurchaseInvoiceCommand({ ...base, lines: [line, line] }, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('billing a goods receipt', () => {
  const lines = [{ productId: 'p1', qtyBoxes: 10, rate: 100 }];

  it('bills a receipt that has nothing against it', async () => {
    const invoices = invoiceRepo();
    const handler = new CreatePurchaseInvoiceHandler(invoices, orderRepo());

    await handler.execute(
      new CreatePurchaseInvoiceCommand({ ...base, receiptId: 'grn1', lines }, 'u1'),
    );

    expect(invoices.create).toHaveBeenCalled();
    expect(invoices.invoiceForReceipt).toHaveBeenCalledWith('grn1', undefined);
  });

  it('refuses a receipt that has already been billed', async () => {
    const invoices = invoiceRepo();
    invoices.invoiceForReceipt.mockResolvedValue('PINV-2026-00007');
    const handler = new CreatePurchaseInvoiceHandler(invoices, orderRepo());

    await expect(
      handler.execute(new CreatePurchaseInvoiceCommand({ ...base, receiptId: 'grn1', lines }, 'u1')),
    ).rejects.toThrow(/already been billed on PINV-2026-00007/);
    expect(invoices.create).not.toHaveBeenCalled();
  });

  it('does not ask about a receipt when the invoice is entered by hand', async () => {
    const invoices = invoiceRepo();
    const handler = new CreatePurchaseInvoiceHandler(invoices, orderRepo());

    await handler.execute(new CreatePurchaseInvoiceCommand({ ...base, lines }, 'u1'));

    expect(invoices.invoiceForReceipt).not.toHaveBeenCalled();
  });
});
