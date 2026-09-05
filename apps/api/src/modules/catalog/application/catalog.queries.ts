import type { PaginationQuery, UUID } from '@tiles-erp/shared-types';

export class ListCatalogQueryBase {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly parentId?: UUID,
  ) {}
}

export class ListCategoriesQuery extends ListCatalogQueryBase {}
export class ListBrandsQuery extends ListCatalogQueryBase {}
export class ListSeriesQuery extends ListCatalogQueryBase {}
export class ListCollectionsQuery extends ListCatalogQueryBase {}
