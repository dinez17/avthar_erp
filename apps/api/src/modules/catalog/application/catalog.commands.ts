import type { CreateCatalogInput, UpdateCatalogInput, UUID } from '@tiles-erp/shared-types';

abstract class BaseCatalogCommand {
  constructor(public readonly actorId: UUID) {}
}

export class CreateCatalogCommandBase extends BaseCatalogCommand {
  constructor(
    public readonly data: CreateCatalogInput,
    actorId: UUID,
  ) {
    super(actorId);
  }
}

export class UpdateCatalogCommandBase extends BaseCatalogCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateCatalogInput,
    actorId: UUID,
  ) {
    super(actorId);
  }
}

export class DeleteCatalogCommandBase extends BaseCatalogCommand {
  constructor(
    public readonly id: UUID,
    actorId: UUID,
  ) {
    super(actorId);
  }
}

export class CreateCategoryCommand extends CreateCatalogCommandBase {}
export class UpdateCategoryCommand extends UpdateCatalogCommandBase {}
export class DeleteCategoryCommand extends DeleteCatalogCommandBase {}
export class CreateBrandCommand extends CreateCatalogCommandBase {}
export class UpdateBrandCommand extends UpdateCatalogCommandBase {}
export class DeleteBrandCommand extends DeleteCatalogCommandBase {}
export class CreateSeriesCommand extends CreateCatalogCommandBase {}
export class UpdateSeriesCommand extends UpdateCatalogCommandBase {}
export class DeleteSeriesCommand extends DeleteCatalogCommandBase {}
export class CreateCollectionCommand extends CreateCatalogCommandBase {}
export class UpdateCollectionCommand extends UpdateCatalogCommandBase {}
export class DeleteCollectionCommand extends DeleteCatalogCommandBase {}
