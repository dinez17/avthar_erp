import {
  calculatePurchaseLine,
  sumPurchaseTotals,
  ValidationError,
} from '@tiles-erp/shared';
import {
  ApprovePurchaseOrderCommand,
  ApprovePurchaseOrderHandler,
  CancelPurchaseOrderCommand,
  CancelPurchaseOrderHandler,
  CreatePurchaseOrderCommand,
  CreatePurchaseOrderHandler,
} from './purchase-order.handlers';
import type { PurchaseOrderRepository } from '../domain/purchase-order.repository';
import type { PurchaseOrderItem } from '@tiles-erp/shared-types';

const mockRepo = (): jest.Mocked<PurchaseOrderRepository> => ({
  nextPoNumber: jest.fn().mockResolvedValue('PO-2026-00001'),
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn().mockResolvedValue({ id: 'po1' } as PurchaseOrderItem),
  update: jest.fn(),
  setStatus: jest.fn().mockResolvedValue({ id: 'po1' } as PurchaseOrderItem),
  assertReferences: jest.fn().mockResolvedValue(undefined),
  productGstRates: jest
    .fn()
    .mockResolvedValue(new Map([['p1', { gstRate: 18, sku: 'SKU-1' }]])),
});

const base = { supplierId: 's1', branchId: 'b1' };

describe('purchase line maths', () => {
  it('applies discount then charges GST on the discounted value', () => {
    // 100 boxes @ 850 = 85,000; 5% discount = 80,750; 18% GST = 14,535
    expect(calculatePurchaseLine(100, 850, 5, 18)).toEqual({
      lineSubTotal: 80750,
      lineGst: 14535,
      lineTotal: 95285,
    });
  });

  it('sums lines into document totals', () => {
    expect(
      sumPurchaseTotals([
        { lineSubTotal: 100, lineGst: 18, lineTotal: 118 },
        { lineSubTotal: 50, lineGst: 9, lineTotal: 59 },
      ]),
    ).toEqual({ subTotal: 150, gstAmount: 27, grandTotal: 177 });
  });
});

describe('CreatePurchaseOrderHandler', () => {
  it("falls back to the product's GST rate and computes totals", async () => {
    const repo = mockRepo();
    const handler = new CreatePurchaseOrderHandler(repo);
    await handler.execute(
      new CreatePurchaseOrderCommand(
        { ...base, lines: [{ productId: 'p1', qtyBoxes: 10, rate: 100 }] },
        'actor',
      ),
    );
    const [, data] = repo.create.mock.calls[0]!;
    expect(data.lines[0]).toMatchObject({ gstRate: 18, lineSubTotal: 1000, lineGst: 180 });
    expect(data.grandTotal).toBe(1180);
  });

  it('rejects duplicate products', async () => {
    const handler = new CreatePurchaseOrderHandler(mockRepo());
    const line = { productId: 'p1', qtyBoxes: 1, rate: 10 };
    await expect(
      handler.execute(new CreatePurchaseOrderCommand({ ...base, lines: [line, line] }, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects zero quantities and out-of-range discounts', async () => {
    const handler = new CreatePurchaseOrderHandler(mockRepo());
    await expect(
      handler.execute(
        new CreatePurchaseOrderCommand(
          { ...base, lines: [{ productId: 'p1', qtyBoxes: 0, rate: 10 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      handler.execute(
        new CreatePurchaseOrderCommand(
          { ...base, lines: [{ productId: 'p1', qtyBoxes: 1, rate: 10, discountPct: 150 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('purchase order status transitions', () => {
  it('approves a draft', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({ id: 'po1', status: 'DRAFT' } as PurchaseOrderItem);
    const handler = new ApprovePurchaseOrderHandler(repo);
    await handler.execute(new ApprovePurchaseOrderCommand('po1', 1, 'actor'));
    expect(repo.setStatus).toHaveBeenCalledWith('po1', 1, 'APPROVED', 'actor');
  });

  it('refuses to approve a non-draft order', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({ id: 'po1', status: 'APPROVED' } as PurchaseOrderItem);
    const handler = new ApprovePurchaseOrderHandler(repo);
    await expect(
      handler.execute(new ApprovePurchaseOrderCommand('po1', 1, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses to cancel an order with received goods', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue({
      id: 'po1',
      status: 'PARTIALLY_RECEIVED',
    } as PurchaseOrderItem);
    const handler = new CancelPurchaseOrderHandler(repo);
    await expect(
      handler.execute(new CancelPurchaseOrderCommand('po1', 1, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
