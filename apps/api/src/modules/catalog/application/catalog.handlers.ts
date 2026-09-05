import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import type { CatalogItem, Paginated } from '@tiles-erp/shared-types';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  COLLECTION_REPOSITORY,
  SERIES_REPOSITORY,
  type CatalogRepository,
} from '../domain/catalog.repository';
import {
  CreateBrandCommand,
  CreateCatalogCommandBase,
  CreateCategoryCommand,
  CreateCollectionCommand,
  CreateSeriesCommand,
  DeleteBrandCommand,
  DeleteCatalogCommandBase,
  DeleteCategoryCommand,
  DeleteCollectionCommand,
  DeleteSeriesCommand,
  UpdateBrandCommand,
  UpdateCatalogCommandBase,
  UpdateCategoryCommand,
  UpdateCollectionCommand,
  UpdateSeriesCommand,
} from './catalog.commands';
import {
  ListBrandsQuery,
  ListCatalogQueryBase,
  ListCategoriesQuery,
  ListCollectionsQuery,
  ListSeriesQuery,
} from './catalog.queries';
import {
  BRAND_RULES,
  CATEGORY_RULES,
  COLLECTION_RULES,
  SERIES_RULES,
  type CatalogRules,
} from './catalog.rules';

abstract class BaseCreateHandler implements ICommandHandler<CreateCatalogCommandBase, CatalogItem> {
  protected constructor(
    private readonly repo: CatalogRepository,
    private readonly rules: CatalogRules,
  ) {}

  async execute(command: CreateCatalogCommandBase): Promise<CatalogItem> {
    const { data } = command;
    if (this.rules.requiresParent && !data.parentId) {
      throw new ValidationError(`${this.rules.label} requires a brand`);
    }
    return this.repo.create({
      name: data.name.trim(),
      code: data.code?.trim().toUpperCase() || null,
      description: data.description?.trim() || null,
      parentId: data.parentId ?? null,
      isActive: data.isActive ?? true,
      supplierId: data.supplierId ?? null,
      createdBy: command.actorId,
    });
  }
}

abstract class BaseUpdateHandler implements ICommandHandler<UpdateCatalogCommandBase, CatalogItem> {
  protected constructor(private readonly repo: CatalogRepository) {}

  execute(command: UpdateCatalogCommandBase): Promise<CatalogItem> {
    const { data } = command;
    return this.repo.update(command.id, {
      name: data.name?.trim(),
      code: data.code === null ? null : data.code?.trim().toUpperCase(),
      description: data.description === null ? null : data.description?.trim(),
      isActive: data.isActive,
      supplierId: data.supplierId,
      updatedBy: command.actorId,
      version: data.version,
    });
  }
}

abstract class BaseDeleteHandler implements ICommandHandler<DeleteCatalogCommandBase, void> {
  protected constructor(private readonly repo: CatalogRepository) {}

  execute(command: DeleteCatalogCommandBase): Promise<void> {
    return this.repo.softDelete(command.id, command.actorId);
  }
}

abstract class BaseListHandler
  implements IQueryHandler<ListCatalogQueryBase, Paginated<CatalogItem>>
{
  protected constructor(private readonly repo: CatalogRepository) {}

  execute(query: ListCatalogQueryBase): Promise<Paginated<CatalogItem>> {
    return this.repo.list(query.pagination, query.parentId);
  }
}

// ---- Category ----
@CommandHandler(CreateCategoryCommand)
export class CreateCategoryHandler extends BaseCreateHandler {
  constructor(@Inject(CATEGORY_REPOSITORY) repo: CatalogRepository) {
    super(repo, CATEGORY_RULES);
  }
}
@CommandHandler(UpdateCategoryCommand)
export class UpdateCategoryHandler extends BaseUpdateHandler {
  constructor(@Inject(CATEGORY_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteCategoryCommand)
export class DeleteCategoryHandler extends BaseDeleteHandler {
  constructor(@Inject(CATEGORY_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
@QueryHandler(ListCategoriesQuery)
export class ListCategoriesHandler extends BaseListHandler {
  constructor(@Inject(CATEGORY_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}

// ---- Brand ----
@CommandHandler(CreateBrandCommand)
export class CreateBrandHandler extends BaseCreateHandler {
  constructor(@Inject(BRAND_REPOSITORY) repo: CatalogRepository) {
    super(repo, BRAND_RULES);
  }
}
@CommandHandler(UpdateBrandCommand)
export class UpdateBrandHandler extends BaseUpdateHandler {
  constructor(@Inject(BRAND_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteBrandCommand)
export class DeleteBrandHandler extends BaseDeleteHandler {
  constructor(@Inject(BRAND_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
@QueryHandler(ListBrandsQuery)
export class ListBrandsHandler extends BaseListHandler {
  constructor(@Inject(BRAND_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}

// ---- Series ----
@CommandHandler(CreateSeriesCommand)
export class CreateSeriesHandler extends BaseCreateHandler {
  constructor(@Inject(SERIES_REPOSITORY) repo: CatalogRepository) {
    super(repo, SERIES_RULES);
  }
}
@CommandHandler(UpdateSeriesCommand)
export class UpdateSeriesHandler extends BaseUpdateHandler {
  constructor(@Inject(SERIES_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteSeriesCommand)
export class DeleteSeriesHandler extends BaseDeleteHandler {
  constructor(@Inject(SERIES_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
@QueryHandler(ListSeriesQuery)
export class ListSeriesHandler extends BaseListHandler {
  constructor(@Inject(SERIES_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}

// ---- Collection ----
@CommandHandler(CreateCollectionCommand)
export class CreateCollectionHandler extends BaseCreateHandler {
  constructor(@Inject(COLLECTION_REPOSITORY) repo: CatalogRepository) {
    super(repo, COLLECTION_RULES);
  }
}
@CommandHandler(UpdateCollectionCommand)
export class UpdateCollectionHandler extends BaseUpdateHandler {
  constructor(@Inject(COLLECTION_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteCollectionCommand)
export class DeleteCollectionHandler extends BaseDeleteHandler {
  constructor(@Inject(COLLECTION_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
@QueryHandler(ListCollectionsQuery)
export class ListCollectionsHandler extends BaseListHandler {
  constructor(@Inject(COLLECTION_REPOSITORY) repo: CatalogRepository) {
    super(repo);
  }
}
