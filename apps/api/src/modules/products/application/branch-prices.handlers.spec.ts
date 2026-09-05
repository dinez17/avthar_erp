import { ValidationError } from '@tiles-erp/shared';
import {
  BulkUpdateBranchPricesCommand,
  BulkUpdateBranchPricesHandler,
} from './branch-prices.handlers';
import type { BranchPricesRepository } from '../domain/branch-prices.repository';
import type { BranchPriceItem } from '@tiles-erp/shared-types';

const item = { productId: 'p1' } as BranchPriceItem;

const mockRepo = (): jest.Mocked<BranchPricesRepository> => ({
  list: jest.fn(),
  bulkUpsert: jest.fn(),
});

const entry = {
  productId: 'p1',
  displayPrice: 1400,
  minSellingPrice: 1150,
  sellingPrice: 1250,
  version: 0,
};

describe('BulkUpdateBranchPricesHandler', () => {
  it('accepts a consistent price ladder', async () => {
    const repo = mockRepo();
    repo.bulkUpsert.mockResolvedValue([item]);
    const handler = new BulkUpdateBranchPricesHandler(repo);
    await handler.execute(
      new BulkUpdateBranchPricesCommand({ branchId: 'b1', items: [entry] }, 'actor'),
    );
    expect(repo.bulkUpsert).toHaveBeenCalledWith('b1', [entry], 'actor');
  });

  it('rejects an actual price below the minimum', async () => {
    const repo = mockRepo();
    const handler = new BulkUpdateBranchPricesHandler(repo);
    await expect(
      handler.execute(
        new BulkUpdateBranchPricesCommand(
          { branchId: 'b1', items: [{ ...entry, sellingPrice: 1000 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a display price below the actual price', async () => {
    const repo = mockRepo();
    const handler = new BulkUpdateBranchPricesHandler(repo);
    await expect(
      handler.execute(
        new BulkUpdateBranchPricesCommand(
          { branchId: 'b1', items: [{ ...entry, displayPrice: 1200 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects duplicates and negatives', async () => {
    const repo = mockRepo();
    const handler = new BulkUpdateBranchPricesHandler(repo);
    await expect(
      handler.execute(
        new BulkUpdateBranchPricesCommand({ branchId: 'b1', items: [entry, entry] }, 'actor'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      handler.execute(
        new BulkUpdateBranchPricesCommand(
          { branchId: 'b1', items: [{ ...entry, minSellingPrice: -1 }] },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
