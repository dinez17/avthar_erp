import { ValidationError } from '@tiles-erp/shared';
import { CreateCategoryHandler, CreateSeriesHandler } from './catalog.handlers';
import { CreateCategoryCommand, CreateSeriesCommand } from './catalog.commands';
import type { CatalogRepository } from '../domain/catalog.repository';
import type { CatalogItem } from '@tiles-erp/shared-types';

const item: CatalogItem = {
  id: 'c1',
  name: 'Vitrified',
  code: null,
  description: null,
  isActive: true,
  parentId: null,
  parentName: null,
  childCount: 0,
  version: 1,
};

const mockRepo = (): jest.Mocked<CatalogRepository> => ({
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
});

describe('Catalog create handlers', () => {
  it('creates a category without a parent, trimming inputs', async () => {
    const repo = mockRepo();
    repo.create.mockResolvedValue(item);
    const handler = new CreateCategoryHandler(repo);
    await handler.execute(new CreateCategoryCommand({ name: '  Vitrified ', code: 'vit' }, 'actor'));
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vitrified', code: 'VIT', parentId: null, isActive: true }),
    );
  });

  it('rejects a series without a brand', async () => {
    const repo = mockRepo();
    const handler = new CreateSeriesHandler(repo);
    await expect(
      handler.execute(new CreateSeriesCommand({ name: 'Marble Look' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
