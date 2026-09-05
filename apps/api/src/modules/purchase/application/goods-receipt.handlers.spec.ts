import { ValidationError } from '@tiles-erp/shared';
import { PostGoodsReceiptCommand, PostGoodsReceiptHandler } from './goods-receipt.handlers';
import type { GoodsReceiptRepository } from '../domain/goods-receipt.repository';
import type { PurchaseOrderRepository } from '../domain/purchase-order.repository';
import type { GoodsReceiptItem, PurchaseOrderItem } from '@tiles-erp/shared-types';

const receiptRepo = (): jest.Mocked<GoodsReceiptRepository> => ({
  nextGrnNumber: jest.fn().mockResolvedValue('GRN-2026-00001'),
  post: jest.fn().mockResolvedValue({ id: 'grn1' } as GoodsReceiptItem),
  list: jest.fn(),
  findById: jest.fn(),
  assertEndpoints: jest.fn().mockResolvedValue(undefined),
});

const orderRepo = (): jest.Mocked<PurchaseOrderRepository> => ({
  nextPoNumber: jest.fn(),
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setStatus: jest.fn(),
  assertReferences: jest.fn(),
  productGstRates: jest
    .fn()
    .mockResolvedValue(new Map([['p1', { gstRate: 18, sku: 'SKU-1' }]])),
});

const approvedOrder = {
  id: 'po1',
  status: 'APPROVED',
  supplierId: 's1',
  branchId: 'b1',
  lines: [
    {
      id: 'ol1',
      productId: 'p1',
      sku: 'SKU-1',
      qtyBoxes: 100,
      rate: 850,
      receivedBoxes: 0,
      pendingBoxes: 100,
    },
  ],
} as PurchaseOrderItem;

const base = { supplierId: 's1', branchId: 'b1', godownId: 'g1' };

describe('PostGoodsReceiptHandler', () => {
  it('receives against an approved order using the order rate', async () => {
    const receipts = receiptRepo();
    const orders = orderRepo();
    orders.findById.mockResolvedValue(approvedOrder);
    const handler = new PostGoodsReceiptHandler(receipts, orders);

    await handler.execute(
      new PostGoodsReceiptCommand(
        {
          ...base,
          orderId: 'po1',
          lines: [{ orderLineId: 'ol1', productId: 'p1', qtyBoxes: 40, batchNo: 'B-1' }],
        },
        'actor',
      ),
    );

    const [data] = receipts.post.mock.calls[0]!;
    expect(data.lines[0]).toMatchObject({ qtyBoxes: 40, rate: 850, batchNo: 'B-1' });
    expect(data.grnNumber).toBe('GRN-2026-00001');
  });

  it('refuses to receive more than the pending quantity', async () => {
    const receipts = receiptRepo();
    const orders = orderRepo();
    orders.findById.mockResolvedValue(approvedOrder);
    const handler = new PostGoodsReceiptHandler(receipts, orders);

    await expect(
      handler.execute(
        new PostGoodsReceiptCommand(
          {
            ...base,
            orderId: 'po1',
            lines: [{ orderLineId: 'ol1', productId: 'p1', qtyBoxes: 150 }],
          },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(receipts.post).not.toHaveBeenCalled();
  });

  it('refuses to receive against a draft order', async () => {
    const receipts = receiptRepo();
    const orders = orderRepo();
    orders.findById.mockResolvedValue({ ...approvedOrder, status: 'DRAFT' });
    const handler = new PostGoodsReceiptHandler(receipts, orders);
    await expect(
      handler.execute(
        new PostGoodsReceiptCommand(
          { ...base, orderId: 'po1', lines: [{ orderLineId: 'ol1', productId: 'p1', qtyBoxes: 1 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a supplier that differs from the order', async () => {
    const receipts = receiptRepo();
    const orders = orderRepo();
    orders.findById.mockResolvedValue(approvedOrder);
    const handler = new PostGoodsReceiptHandler(receipts, orders);
    await expect(
      handler.execute(
        new PostGoodsReceiptCommand(
          {
            ...base,
            supplierId: 'other',
            orderId: 'po1',
            lines: [{ orderLineId: 'ol1', productId: 'p1', qtyBoxes: 1 }],
          },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('supports direct receipts without an order when a rate is given', async () => {
    const receipts = receiptRepo();
    const handler = new PostGoodsReceiptHandler(receipts, orderRepo());
    await handler.execute(
      new PostGoodsReceiptCommand(
        { ...base, lines: [{ productId: 'p1', qtyBoxes: 10, rate: 900 }] },
        'actor',
      ),
    );
    const [data] = receipts.post.mock.calls[0]!;
    expect(data.orderId).toBeNull();
    expect(data.lines[0]).toMatchObject({ rate: 900, orderLineId: null });
  });

  it('requires a rate on direct receipts', async () => {
    const handler = new PostGoodsReceiptHandler(receiptRepo(), orderRepo());
    await expect(
      handler.execute(
        new PostGoodsReceiptCommand({ ...base, lines: [{ productId: 'p1', qtyBoxes: 10 }] }, 'a'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
