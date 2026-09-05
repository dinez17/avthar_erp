import type { UUID } from './common';

export type ProductUom = 'BOX' | 'PIECE' | 'SQFT';

/** Product master read model. */
/**
 * Where a product stands with SixOrbit.
 *
 * BLOCKED is deliberately not FAILED: the queue cannot fix it, only a person can — by
 * adding the missing brand or category on SixOrbit's side, which their API cannot do.
 */
export type ProductSyncStatus =
  'NOT_SYNCED' | 'PENDING' | 'SYNCED' | 'NEEDS_ATTENTION' | 'FAILED' | 'BLOCKED';

export interface ProductItem {
  id: UUID;
  sku: string;
  name: string;
  description: string | null;
  categoryId: UUID;
  categoryName: string;
  brandId: UUID;
  brandName: string;
  seriesId: UUID | null;
  seriesName: string | null;
  collectionId: UUID | null;
  collectionName: string | null;
  sizeMm: string | null;
  piecesPerBox: number;
  sqftPerBox: number;
  /** Derived: sqftPerBox / piecesPerBox, rounded to 4 decimals. */
  sqftPerPiece: number;
  baseUom: ProductUom;
  hsnCode: string;
  gstRate: number;
  mrp: number | null;
  sellingRate: number | null;
  reorderLevelBoxes: number | null;
  purchaseRate: number | null;
  transportRate: number;
  additionalRate: number;
  landingCost: number | null;
  barcode: string | null;
  isActive: boolean;
  /** Where this product stands with SixOrbit. Null when the integration is not in use. */
  sixorbitSyncStatus: ProductSyncStatus | null;
  /** Their id, once they have it. */
  sixorbitId: string | null;
  /** Why the last attempt did not work, in language meant for a person. */
  sixorbitSyncError: string | null;
  version: number;
}

/** One row of a bulk purchase-rate update. */
export interface ProductRateUpdateEntry {
  productId: UUID;
  purchaseRate: number;
  transportRate: number;
  additionalRate: number;
  /** Optional GST correction applied alongside the rates. */
  gstRate?: number;
  version: number;
}

/** Payload for the bulk purchase-rate update endpoint. */
export interface BulkUpdateProductRatesInput {
  items: ProductRateUpdateEntry[];
}

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string;
  categoryId: UUID;
  brandId: UUID;
  seriesId?: UUID;
  collectionId?: UUID;
  sizeMm?: string;
  piecesPerBox: number;
  sqftPerBox: number;
  baseUom?: ProductUom;
  hsnCode: string;
  gstRate: number;
  mrp?: number;
  sellingRate?: number;
  barcode?: string;
  reorderLevelBoxes?: number;
  isActive?: boolean;
}

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  description?: string | null;
  categoryId?: UUID;
  brandId?: UUID;
  seriesId?: UUID | null;
  collectionId?: UUID | null;
  sizeMm?: string | null;
  piecesPerBox?: number;
  sqftPerBox?: number;
  baseUom?: ProductUom;
  hsnCode?: string;
  gstRate?: number;
  mrp?: number | null;
  sellingRate?: number | null;
  barcode?: string | null;
  reorderLevelBoxes?: number | null;
  isActive?: boolean;
  version: number;
}

// ---------------------------------------------------------------------
// Data audit
// ---------------------------------------------------------------------

/** One product whose recorded area disagrees with its own size. */
export interface AreaAuditRow {
  productId: UUID;
  sku: string;
  name: string;
  sizeMm: string | null;
  piecesPerBox: number;
  /** What the product currently says a box covers. */
  storedSqftPerBox: number;
  /** What its size and piece count say it should. */
  expectedSqftPerBox: number;
  /** stored ÷ expected, so the size of the error is visible. */
  ratio: number;
  likelyCause: string;
  /** Boxes in stock, because a wrong figure on a product nobody holds matters less. */
  stockBoxes: number;
}

export interface AreaAudit {
  rows: AreaAuditRow[];
  /** Products checked — those with a size that could be read. */
  checked: number;
  /** Products skipped because their size could not be parsed. */
  unreadable: number;
}

export interface FixProductAreaInput {
  /** Left out, every suspect product is corrected. */
  productIds?: UUID[];
}
