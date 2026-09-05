import {
  ConflictError,
  ValidationError,
  formatStockQuantity,
  splitBoxesPieces,
} from '@tiles-erp/shared';
import {
  BulkSetStockCommand,
  BulkSetStockHandler,
  PostAdjustmentCommand,
  PostAdjustmentHandler,
  PostOpeningStockCommand,
  PostOpeningStockHandler,
} from './stock.handlers';
import type { StockRepository } from '../domain/stock.repository';

const mockRepo = (): jest.Mocked<StockRepository> => ({
  postMovements: jest.fn().mockResolvedValue(1),
  listBalances: jest.fn(),
  listCountSheet: jest.fn(),
  listMovements: jest.fn(),
  currentQty: jest.fn().mockResolvedValue(0),
  hasOpeningStock: jest.fn().mockResolvedValue(false),
  productConversions: jest
    .fn()
    .mockResolvedValue(new Map([['p1', { piecesPerBox: 4, sku: 'SKU-1' }]])),
  currentQtyMany: jest.fn().mockResolvedValue(new Map()),
});

const line = { productId: 'p1', godownId: 'g1', qtyBoxes: 25 };

describe('PostOpeningStockHandler', () => {
  it('posts IN movements for each line', async () => {
    const repo = mockRepo();
    const handler = new PostOpeningStockHandler(repo);
    await handler.execute(new PostOpeningStockCommand({ branchId: 'b1', lines: [line] }, 'actor'));
    expect(repo.postMovements).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'OPENING', direction: 'IN', qtyBoxes: 25 }),
    ]);
  });

  it('refuses to declare opening stock twice for the same product/godown', async () => {
    const repo = mockRepo();
    repo.hasOpeningStock.mockResolvedValue(true);
    const handler = new PostOpeningStockHandler(repo);
    await expect(
      handler.execute(new PostOpeningStockCommand({ branchId: 'b1', lines: [line] }, 'actor')),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.postMovements).not.toHaveBeenCalled();
  });

  it('rejects negative opening quantities', async () => {
    const repo = mockRepo();
    const handler = new PostOpeningStockHandler(repo);
    await expect(
      handler.execute(
        new PostOpeningStockCommand({ branchId: 'b1', lines: [{ ...line, qtyBoxes: -5 }] }, 'a'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects duplicate stock keys in one posting', async () => {
    const repo = mockRepo();
    const handler = new PostOpeningStockHandler(repo);
    await expect(
      handler.execute(new PostOpeningStockCommand({ branchId: 'b1', lines: [line, line] }, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('PostAdjustmentHandler', () => {
  it('maps positive lines to IN and negative lines to OUT', async () => {
    const repo = mockRepo();
    repo.currentQty.mockResolvedValue(100);
    const handler = new PostAdjustmentHandler(repo);
    await handler.execute(
      new PostAdjustmentCommand(
        {
          branchId: 'b1',
          reason: 'Physical count',
          lines: [line, { productId: 'p2', godownId: 'g1', qtyBoxes: -10 }],
        },
        'actor',
      ),
    );
    expect(repo.postMovements).toHaveBeenCalledWith([
      expect.objectContaining({ direction: 'IN', qtyBoxes: 25 }),
      expect.objectContaining({ direction: 'OUT', qtyBoxes: 10 }),
    ]);
  });

  it('requires a reason', async () => {
    const repo = mockRepo();
    const handler = new PostAdjustmentHandler(repo);
    await expect(
      handler.execute(new PostAdjustmentCommand({ branchId: 'b1', reason: ' ', lines: [line] }, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('never lets stock go negative', async () => {
    const repo = mockRepo();
    repo.currentQty.mockResolvedValue(5);
    const handler = new PostAdjustmentHandler(repo);
    await expect(
      handler.execute(
        new PostAdjustmentCommand(
          { branchId: 'b1', reason: 'Damage', lines: [{ ...line, qtyBoxes: -10 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.postMovements).not.toHaveBeenCalled();
  });
});


describe('BulkSetStockHandler', () => {
  const base = { branchId: 'b1', godownId: 'g1', reason: 'Physical count' };

  it('posts the difference between counted and current stock', async () => {
    const repo = mockRepo();
    repo.currentQtyMany.mockResolvedValue(new Map([['p1||', 30]]));
    const handler = new BulkSetStockHandler(repo);

    const result = await handler.execute(
      new BulkSetStockCommand(
        { ...base, lines: [{ productId: 'p1', boxes: 40, pieces: 0 }] },
        'actor',
      ),
    );

    expect(repo.postMovements).toHaveBeenCalledWith([
      expect.objectContaining({ direction: 'IN', qtyBoxes: 10, refType: 'STOCK_COUNT' }),
    ]);
    expect(result.lines[0]).toMatchObject({ previousBoxes: 30, newBoxes: 40, deltaBoxes: 10 });
  });

  it('folds loose pieces into fractional boxes', async () => {
    const repo = mockRepo();
    repo.currentQtyMany.mockResolvedValue(new Map([['p1||', 0]]));
    const handler = new BulkSetStockHandler(repo);

    // 4 pieces per box, so 10 boxes + 2 pieces = 10.5 boxes
    await handler.execute(
      new BulkSetStockCommand(
        { ...base, lines: [{ productId: 'p1', boxes: 10, pieces: 2 }] },
        'actor',
      ),
    );
    expect(repo.postMovements).toHaveBeenCalledWith([
      expect.objectContaining({ qtyBoxes: 10.5, direction: 'IN' }),
    ]);
  });

  it('posts an OUT movement when the count is lower', async () => {
    const repo = mockRepo();
    repo.currentQtyMany.mockResolvedValue(new Map([['p1||', 50]]));
    const handler = new BulkSetStockHandler(repo);
    await handler.execute(
      new BulkSetStockCommand({ ...base, lines: [{ productId: 'p1', boxes: 45, pieces: 0 }] }, 'a'),
    );
    expect(repo.postMovements).toHaveBeenCalledWith([
      expect.objectContaining({ direction: 'OUT', qtyBoxes: 5 }),
    ]);
  });

  it('skips lines whose count already matches', async () => {
    const repo = mockRepo();
    repo.currentQtyMany.mockResolvedValue(new Map([['p1||', 40]]));
    const handler = new BulkSetStockHandler(repo);
    const result = await handler.execute(
      new BulkSetStockCommand({ ...base, lines: [{ productId: 'p1', boxes: 40, pieces: 0 }] }, 'a'),
    );
    expect(repo.postMovements).toHaveBeenCalledWith([]);
    expect(result.unchanged).toBe(1);
  });

  it('requires a reason and rejects negatives', async () => {
    const repo = mockRepo();
    const handler = new BulkSetStockHandler(repo);
    await expect(
      handler.execute(
        new BulkSetStockCommand(
          { ...base, reason: ' ', lines: [{ productId: 'p1', boxes: 1, pieces: 0 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      handler.execute(
        new BulkSetStockCommand(
          { ...base, lines: [{ productId: 'p1', boxes: -1, pieces: 0 }] },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});


describe('stock quantity presentation', () => {
  it('splits fractional boxes into box + loose pieces', () => {
    expect(splitBoxesPieces(20.5, 4)).toEqual({ boxes: 20, pieces: 2 });
    expect(splitBoxesPieces(10, 4)).toEqual({ boxes: 10, pieces: 0 });
  });

  it('formats box-based products as "20 box 2 pcs"', () => {
    expect(formatStockQuantity(20.5, 4, 15.5, 'BOX')).toBe('20 box 2 pcs');
    expect(formatStockQuantity(10, 4, 15.5, 'BOX')).toBe('10 box');
  });

  it('formats piece-based products in pieces only', () => {
    expect(formatStockQuantity(20.5, 4, 15.5, 'PIECE')).toBe('82 pcs');
  });

  it('formats sqft-based products in square feet', () => {
    expect(formatStockQuantity(2, 4, 15.5, 'SQFT')).toBe('31 sq.ft');
  });
});
