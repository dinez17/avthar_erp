import type { UUID } from './common';

/**
 * Unified read model for the catalog masters (Category, Brand, Series, Collection).
 * `parentId`/`parentName` reference the owning brand for Series and Collection and
 * are null for Category and Brand.
 */
export interface CatalogItem {
  id: UUID;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  parentId: UUID | null;
  parentName: string | null;
  childCount: number;
  /** Brands only: the supplier for the brand, and their name. Null for the other masters. */
  supplierId: UUID | null;
  supplierName: string | null;
  version: number;
}

/** Write model accepted by every catalog create endpoint. */
export interface CreateCatalogInput {
  name: string;
  code?: string;
  description?: string;
  parentId?: UUID;
  isActive?: boolean;
  /** Brands only: the supplier for the brand. */
  supplierId?: UUID | null;
}

/** Write model accepted by every catalog update endpoint. */
export interface UpdateCatalogInput {
  name?: string;
  code?: string | null;
  description?: string | null;
  isActive?: boolean;
  supplierId?: UUID | null;
  version: number;
}
