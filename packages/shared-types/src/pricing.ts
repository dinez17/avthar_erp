import type { UUID } from './common';

/** A product row with its branch-specific selling prices (null when not yet set). */
export interface BranchPriceItem {
  productId: UUID;
  sku: string;
  name: string;
  brandName: string;
  categoryName: string;
  sizeMm: string | null;
  /** Purchase-side reference for margin decisions. */
  landingCost: number | null;
  displayPrice: number | null;
  minSellingPrice: number | null;
  sellingPrice: number | null;
  /** Version of the price row; 0 when no price exists yet. */
  version: number;
}

/** One row of a bulk branch-price update. */
export interface BranchPriceUpdateEntry {
  productId: UUID;
  displayPrice: number;
  minSellingPrice: number;
  sellingPrice: number;
  /** 0 for a new price row, otherwise the version last read. */
  version: number;
}

export interface BulkUpdateBranchPricesInput {
  branchId: UUID;
  items: BranchPriceUpdateEntry[];
}
