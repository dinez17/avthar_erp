import type { CatalogItem, Paginated, PaginationQuery, UUID } from '@tiles-erp/shared-types';

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');
export const SERIES_REPOSITORY = Symbol('SERIES_REPOSITORY');
export const COLLECTION_REPOSITORY = Symbol('COLLECTION_REPOSITORY');

export interface CreateCatalogData {
  name: string;
  code: string | null;
  description: string | null;
  parentId: UUID | null;
  isActive: boolean;
  /** Brands only; ignored by the other masters. */
  supplierId: UUID | null;
  createdBy: UUID;
}

export interface UpdateCatalogData {
  name?: string;
  code?: string | null;
  description?: string | null;
  isActive?: boolean;
  /** Brands only; ignored by the other masters. */
  supplierId?: UUID | null;
  updatedBy: UUID;
  version: number;
}

/**
 * Uniform persistence port implemented once per catalog master. Entity-specific
 * rules (name-uniqueness scope, parent validation, delete blocking) live in the
 * implementations; the handlers stay generic.
 */
export interface CatalogRepository {
  list(query: PaginationQuery, parentId?: UUID): Promise<Paginated<CatalogItem>>;
  create(data: CreateCatalogData): Promise<CatalogItem>;
  update(id: UUID, data: UpdateCatalogData): Promise<CatalogItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}
