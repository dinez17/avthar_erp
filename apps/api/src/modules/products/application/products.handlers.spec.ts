import type { EventBus } from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import { CreateProductHandler, CreateProductCommand } from './products.handlers';
import type { ProductsRepository } from '../domain/products.repository';
import type { ProductItem } from '@tiles-erp/shared-types';

const item = { id: 'p1' } as ProductItem;

const mockRepo = (): jest.Mocked<ProductsRepository> => ({
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  listSizes: jest.fn(),
  bulkUpdateRates: jest.fn(),
  auditArea: jest.fn(),
  fixArea: jest.fn(),
});

const baseInput = {
  sku: ' kaj-vit-600 ',
  name: '  Vitrified 600x600 ',
  categoryId: 'c1',
  brandId: 'b1',
  piecesPerBox: 4,
  sqftPerBox: 15.5,
  hsnCode: '69072100',
  gstRate: 18,
};

/** Records what was published, without pulling in the CQRS module. */
const mockBus = () => ({ publish: jest.fn() }) as unknown as EventBus;

describe('CreateProductHandler', () => {
  it('normalises sku/name and applies defaults', async () => {
    const repo = mockRepo();
    repo.create.mockResolvedValue(item);
    const handler = new CreateProductHandler(repo, mockBus());
    await handler.execute(new CreateProductCommand(baseInput, 'actor'));
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'KAJ-VIT-600',
        name: 'Vitrified 600x600',
        baseUom: 'BOX',
        isActive: true,
        seriesId: null,
      }),
    );
  });

  it('rejects zero pieces per box', async () => {
    const repo = mockRepo();
    const handler = new CreateProductHandler(repo, mockBus());
    await expect(
      handler.execute(new CreateProductCommand({ ...baseInput, piecesPerBox: 0 }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects non-positive sqft per box', async () => {
    const repo = mockRepo();
    const handler = new CreateProductHandler(repo, mockBus());
    await expect(
      handler.execute(new CreateProductCommand({ ...baseInput, sqftPerBox: 0 }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

import { BulkUpdateProductRatesHandler, BulkUpdateProductRatesCommand } from './products.handlers';
import { calculateLandingCost } from '@tiles-erp/shared';

describe('calculateLandingCost', () => {
  it('adds GST on top of purchase + transport + additional', () => {
    expect(calculateLandingCost(850, 40, 10, 18)).toBe(1062);
  });

  it('rounds to 2 decimals', () => {
    expect(calculateLandingCost(100.33, 0, 0, 18)).toBe(118.39);
  });
});

describe('BulkUpdateProductRatesHandler', () => {
  const entry = {
    productId: 'p1',
    purchaseRate: 850,
    transportRate: 40,
    additionalRate: 10,
    version: 1,
  };

  it('delegates valid batches to the repository', async () => {
    const repo = mockRepo();
    repo.bulkUpdateRates.mockResolvedValue([item]);
    const handler = new BulkUpdateProductRatesHandler(repo);
    await handler.execute(new BulkUpdateProductRatesCommand({ items: [entry] }, 'actor'));
    expect(repo.bulkUpdateRates).toHaveBeenCalledWith([entry], 'actor');
  });

  it('rejects duplicate products in one batch', async () => {
    const repo = mockRepo();
    const handler = new BulkUpdateProductRatesHandler(repo);
    await expect(
      handler.execute(new BulkUpdateProductRatesCommand({ items: [entry, entry] }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an out-of-range GST correction', async () => {
    const repo = mockRepo();
    const handler = new BulkUpdateProductRatesHandler(repo);
    await expect(
      handler.execute(
        new BulkUpdateProductRatesCommand({ items: [{ ...entry, gstRate: 40 }] }, 'actor'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects negative rates', async () => {
    const repo = mockRepo();
    const handler = new BulkUpdateProductRatesHandler(repo);
    await expect(
      handler.execute(
        new BulkUpdateProductRatesCommand({ items: [{ ...entry, purchaseRate: -1 }] }, 'actor'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('product change events', () => {
  it('announces a created product so the SixOrbit push can pick it up', async () => {
    // Published rather than pushed directly: the products module must not know that
    // SixOrbit exists, or the next integration has to be wired in here too.
    const repo = mockRepo();
    repo.create.mockResolvedValue(item);
    const bus = mockBus();
    await new CreateProductHandler(repo, bus).execute(new CreateProductCommand(baseInput, 'actor'));
    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it('does not announce a product that failed validation', async () => {
    // Nothing was written, so nothing should be synced.
    const repo = mockRepo();
    const bus = mockBus();
    await expect(
      new CreateProductHandler(repo, bus).execute(
        new CreateProductCommand({ ...baseInput, piecesPerBox: 0 }, 'actor'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(bus.publish).not.toHaveBeenCalled();
  });
});
