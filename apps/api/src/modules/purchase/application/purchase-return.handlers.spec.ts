import { ValidationError } from '@tiles-erp/shared';
import {
  CreatePurchaseReturnCommand,
  CreatePurchaseReturnHandler,
} from './purchase-return.handlers';
import type { PurchaseReturnRepository } from '../domain/purchase-return.repository';
import type { PurchaseOrderRepository } from '../domain/purchase-order.repository';
import type { PurchaseReturnItem } from '@tiles-erp/shared-types';

const returnRepo = (): jest.Mocked<PurchaseReturnRepository> => ({
  nextReturnNumber: jest.fn().mockResolvedValue('PRET-2026-00001'),
  create: jest.fn().mockResolvedValue({ id: 'r1' } as PurchaseReturnItem),
  post: jest.fn(),
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

const base = { supplierId: 's1', branchId: 'b1', godownId: 'g1', reason: 'Damaged in transit' };

describe('CreatePurchaseReturnHandler', () => {
  it('prices lines with the product GST rate and totals the debit note', async () => {
    const returns = returnRepo();
    const handler = new CreatePurchaseReturnHandler(returns, orderRepo());

    await handler.execute(
      new CreatePurchaseReturnCommand(
        { ...base, lines: [{ productId: 'p1', qtyBoxes: 5, rate: 100, batchNo: 'B-1' }] },
        'actor',
      ),
    );

    const [data] = returns.create.mock.calls[0]!;
    expect(data.lines[0]).toMatchObject({ gstRate: 18, lineSubTotal: 500, lineGst: 90 });
    expect(data.grandTotal).toBe(590);
    expect(data.returnNumber).toBe('PRET-2026-00001');
  });

  it('requires a reason', async () => {
    const handler = new CreatePurchaseReturnHandler(returnRepo(), orderRepo());
    await expect(
      handler.execute(
        new CreatePurchaseReturnCommand(
          { ...base, reason: '  ', lines: [{ productId: 'p1', qtyBoxes: 1, rate: 10 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects duplicate product/batch/shade lines', async () => {
    const handler = new CreatePurchaseReturnHandler(returnRepo(), orderRepo());
    const line = { productId: 'p1', qtyBoxes: 1, rate: 10, batchNo: 'B-1' };
    await expect(
      handler.execute(new CreatePurchaseReturnCommand({ ...base, lines: [line, line] }, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('allows the same product in different batches', async () => {
    const returns = returnRepo();
    const handler = new CreatePurchaseReturnHandler(returns, orderRepo());
    await handler.execute(
      new CreatePurchaseReturnCommand(
        {
          ...base,
          lines: [
            { productId: 'p1', qtyBoxes: 1, rate: 10, batchNo: 'B-1' },
            { productId: 'p1', qtyBoxes: 2, rate: 10, batchNo: 'B-2' },
          ],
        },
        'actor',
      ),
    );
    const [data] = returns.create.mock.calls[0]!;
    expect(data.lines).toHaveLength(2);
  });

  it('rejects zero quantities', async () => {
    const handler = new CreatePurchaseReturnHandler(returnRepo(), orderRepo());
    await expect(
      handler.execute(
        new CreatePurchaseReturnCommand(
          { ...base, lines: [{ productId: 'p1', qtyBoxes: 0, rate: 10 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
