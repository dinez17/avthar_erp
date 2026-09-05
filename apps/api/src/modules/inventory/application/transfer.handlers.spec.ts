import { ValidationError } from '@tiles-erp/shared';
import type { StockTransferItem } from '@tiles-erp/shared-types';
import {
  CancelTransferCommand,
  CancelTransferHandler,
  CreateTransferCommand,
  CreateTransferHandler,
  ReceiveTransferCommand,
  ReceiveTransferHandler,
} from './transfer.handlers';
import type { StockRepository } from '../domain/stock.repository';
import type { TransferRepository } from '../domain/transfer.repository';

/** Two godowns of one branch: one GSTIN, one state, so the paper is a challan. */
const SAME_REGISTRATION = {
  fromGstin: '33AABCT1234C1Z5',
  toGstin: '33AABCT1234C1Z5',
  fromStateCode: '33',
  toStateCode: '33',
};

const transferRepo = (): jest.Mocked<TransferRepository> => ({
  nextTransferNo: jest.fn().mockResolvedValue('TRF-2026-00001'),
  nextDocumentNo: jest.fn().mockResolvedValue('DC-2026-00001'),
  create: jest.fn().mockResolvedValue({ id: 't1' } as StockTransferItem),
  receive: jest.fn().mockResolvedValue({ id: 't1' } as StockTransferItem),
  cancel: jest.fn().mockResolvedValue({ id: 't1' } as StockTransferItem),
  list: jest.fn(),
  findById: jest.fn(),
  printData: jest.fn(),
  assertEndpoints: jest.fn().mockResolvedValue(SAME_REGISTRATION),
  assertCarrier: jest.fn().mockResolvedValue(undefined),
  productValuation: jest
    .fn()
    .mockResolvedValue(new Map([['p1', { rate: 450, gstRate: 18 }]])),
});

const stockRepo = (): jest.Mocked<StockRepository> => ({
  postMovements: jest.fn(),
  listBalances: jest.fn(),
  listCountSheet: jest.fn(),
  listMovements: jest.fn(),
  currentQty: jest.fn().mockResolvedValue(100),
  hasOpeningStock: jest.fn(),
  productConversions: jest
    .fn()
    .mockResolvedValue(new Map([['p1', { piecesPerBox: 4, sku: 'SKU-1' }]])),
  currentQtyMany: jest.fn(),
});

const base = {
  fromBranchId: 'b1',
  fromGodownId: 'g1',
  toBranchId: 'b1',
  toGodownId: 'g2',
};

/** A transfer as it sits in transit, ready to be received or turned back. */
const inTransit = (overrides: Partial<StockTransferItem> = {}): StockTransferItem =>
  ({
    id: 't1',
    transferNo: 'TRF-2026-00001',
    documentNo: 'DC-2026-00001',
    status: 'IN_TRANSIT',
    fromBranchId: 'b1',
    fromGodownId: 'g1',
    toBranchId: 'b1',
    toGodownId: 'g2',
    lines: [
      {
        productId: 'p1',
        sku: 'SKU-1',
        batchNo: null,
        shade: null,
        qtyBoxes: 100,
        qtyReceived: null,
        qtyShort: 0,
      },
    ],
    ...overrides,
  }) as StockTransferItem;

describe('CreateTransferHandler', () => {
  it('posts only the OUT leg: the goods are on a lorry, not in the far godown', async () => {
    const transfers = transferRepo();
    const handler = new CreateTransferHandler(transfers, stockRepo());

    await handler.execute(
      new CreateTransferCommand(
        { ...base, lines: [{ productId: 'p1', boxes: 10, pieces: 2 }] },
        'actor',
      ),
    );

    const [, postings] = transfers.create.mock.calls[0]!;
    expect(postings).toEqual([
      expect.objectContaining({
        type: 'TRANSFER_OUT',
        direction: 'OUT',
        qtyBoxes: 10.5,
        godownId: 'g1',
      }),
    ]);
  });

  it('raises a delivery challan between two godowns of one registration', async () => {
    const transfers = transferRepo();
    const handler = new CreateTransferHandler(transfers, stockRepo());

    await handler.execute(
      new CreateTransferCommand({ ...base, lines: [{ productId: 'p1', boxes: 10, pieces: 0 }] }, 'a'),
    );

    const [record] = transfers.create.mock.calls[0]!;
    expect(record.documentType).toBe('DELIVERY_CHALLAN');
    // Value for the road, but no tax: moving your own stock is not a supply.
    expect(record.subTotal).toBe(4500);
    expect(record.gstAmount).toBe(0);
    expect(record.grandTotal).toBe(4500);
  });

  it('raises a tax invoice when the two branches are registered separately', async () => {
    const transfers = transferRepo();
    transfers.assertEndpoints.mockResolvedValue({
      fromGstin: '33AABCT1234C1Z5',
      toGstin: '29AABCT1234C1ZB',
      fromStateCode: '33',
      toStateCode: '29',
    });
    const handler = new CreateTransferHandler(transfers, stockRepo());

    await handler.execute(
      new CreateTransferCommand(
        { ...base, toBranchId: 'b2', lines: [{ productId: 'p1', boxes: 10, pieces: 0 }] },
        'a',
      ),
    );

    const [record] = transfers.create.mock.calls[0]!;
    expect(record.documentType).toBe('TAX_INVOICE');
    expect(record.subTotal).toBe(4500);
    // Different states, so the whole tax is IGST.
    expect(record.igstAmount).toBe(810);
    expect(record.cgstAmount).toBe(0);
    expect(record.grandTotal).toBe(5310);
  });

  it("values a line at the product's landing cost when no rate is typed", async () => {
    const transfers = transferRepo();
    const handler = new CreateTransferHandler(transfers, stockRepo());
    await handler.execute(
      new CreateTransferCommand({ ...base, lines: [{ productId: 'p1', boxes: 2, pieces: 0 }] }, 'a'),
    );
    expect(transfers.create.mock.calls[0]![0].lines[0]!.rate).toBe(450);
  });

  it('lets a typed rate override the landing cost', async () => {
    const transfers = transferRepo();
    const handler = new CreateTransferHandler(transfers, stockRepo());
    await handler.execute(
      new CreateTransferCommand(
        { ...base, lines: [{ productId: 'p1', boxes: 2, pieces: 0, rate: 500 }] },
        'a',
      ),
    );
    const line = transfers.create.mock.calls[0]![0].lines[0]!;
    expect(line.rate).toBe(500);
    expect(line.lineSubTotal).toBe(1000);
  });

  it('rejects a transfer to the same godown', async () => {
    const handler = new CreateTransferHandler(transferRepo(), stockRepo());
    await expect(
      handler.execute(
        new CreateTransferCommand(
          { ...base, toGodownId: 'g1', lines: [{ productId: 'p1', boxes: 1, pieces: 0 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses to move more than is available at the source', async () => {
    const transfers = transferRepo();
    const stock = stockRepo();
    stock.currentQty.mockResolvedValue(5);
    const handler = new CreateTransferHandler(transfers, stock);

    await expect(
      handler.execute(
        new CreateTransferCommand(
          { ...base, lines: [{ productId: 'p1', boxes: 10, pieces: 0 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transfers.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate product/batch/shade lines', async () => {
    const handler = new CreateTransferHandler(transferRepo(), stockRepo());
    const line = { productId: 'p1', boxes: 1, pieces: 0 };
    await expect(
      handler.execute(new CreateTransferCommand({ ...base, lines: [line, line] }, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ReceiveTransferHandler', () => {
  it('posts the IN leg at the destination for what arrived', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new ReceiveTransferHandler(transfers);

    await handler.execute(
      new ReceiveTransferCommand('t1', { receivedByName: 'S. Kumar' }, 'actor'),
    );

    const [, postings] = transfers.receive.mock.calls[0]!;
    expect(postings).toEqual([
      expect.objectContaining({
        type: 'TRANSFER_IN',
        direction: 'IN',
        qtyBoxes: 100,
        godownId: 'g2',
      }),
    ]);
  });

  it('treats a line nobody mentioned as fully received', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new ReceiveTransferHandler(transfers);

    await handler.execute(
      new ReceiveTransferCommand('t1', { receivedByName: 'S. Kumar', lines: [] }, 'actor'),
    );

    expect(transfers.receive.mock.calls[0]![0].lines[0]!.qtyReceived).toBe(100);
  });

  it('books in only what arrived, leaving the shortfall unposted', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new ReceiveTransferHandler(transfers);

    await handler.execute(
      new ReceiveTransferCommand(
        't1',
        { receivedByName: 'S. Kumar', lines: [{ productId: 'p1', qtyReceived: 98 }] },
        'actor',
      ),
    );

    const [record, postings] = transfers.receive.mock.calls[0]!;
    expect(record.lines[0]!.qtyReceived).toBe(98);
    expect(postings[0]).toMatchObject({ qtyBoxes: 98, remarks: 'Short by 2 of 100' });
  });

  it('posts nothing for a line that arrived entirely broken', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new ReceiveTransferHandler(transfers);

    await handler.execute(
      new ReceiveTransferCommand(
        't1',
        { receivedByName: 'S. Kumar', lines: [{ productId: 'p1', qtyReceived: 0 }] },
        'actor',
      ),
    );

    expect(transfers.receive.mock.calls[0]![1]).toEqual([]);
  });

  it('refuses more arriving than was sent', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new ReceiveTransferHandler(transfers);

    await expect(
      handler.execute(
        new ReceiveTransferCommand(
          't1',
          { receivedByName: 'S. Kumar', lines: [{ productId: 'p1', qtyReceived: 105 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses to receive the same transfer twice', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit({ status: 'RECEIVED' }));
    const handler = new ReceiveTransferHandler(transfers);

    await expect(
      handler.execute(new ReceiveTransferCommand('t1', { receivedByName: 'S' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transfers.receive).not.toHaveBeenCalled();
  });

  it('requires a name against the acknowledgement', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new ReceiveTransferHandler(transfers);

    await expect(
      handler.execute(new ReceiveTransferCommand('t1', { receivedByName: '   ' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a counted line that is not on the transfer', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new ReceiveTransferHandler(transfers);

    await expect(
      handler.execute(
        new ReceiveTransferCommand(
          't1',
          { receivedByName: 'S', lines: [{ productId: 'p9', qtyReceived: 1 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('CancelTransferHandler', () => {
  it('posts the stock home to the source godown', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new CancelTransferHandler(transfers);

    await handler.execute(
      new CancelTransferCommand('t1', { reason: 'Lorry broke down' }, 'actor'),
    );

    const [, postings] = transfers.cancel.mock.calls[0]!;
    expect(postings).toEqual([
      expect.objectContaining({ direction: 'IN', godownId: 'g1', qtyBoxes: 100 }),
    ]);
  });

  it('will not cancel a transfer that has already arrived', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit({ status: 'RECEIVED' }));
    const handler = new CancelTransferHandler(transfers);

    await expect(
      handler.execute(new CancelTransferCommand('t1', { reason: 'oops' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transfers.cancel).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    const transfers = transferRepo();
    transfers.findById.mockResolvedValue(inTransit());
    const handler = new CancelTransferHandler(transfers);

    await expect(
      handler.execute(new CancelTransferCommand('t1', { reason: '  ' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
