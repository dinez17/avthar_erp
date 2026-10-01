import type { UUID } from './common';

/** A product row with GST-inclusive branch selling prices (null when not yet set). */
export interface BranchPriceItem {
  productId: UUID;
  sku: string;
  name: string;
  brandName: string;
  categoryName: string;
  sizeMm: string | null;
  /** Purchase-side reference for margin decisions. */
  landingCost: number | null;
  gstRate: number;
  /** Product-master MRP. This value is shared by every branch. */
  mrp: number | null;
  displayPrice: number | null;
  minSellingPrice: number | null;
  sellingPrice: number | null;
  /** Reference only; not automatically applied to franchisee sales. */
  franchiseeRate: number | null;
  /** Version of the price row; 0 when no price exists yet. */
  version: number;
}

/** One row of a bulk branch-price update. */
export interface BranchPriceUpdateEntry {
  productId: UUID;
  displayPrice: number;
  minSellingPrice: number;
  sellingPrice: number;
  /** GST-inclusive reference rate for franchisee customers. */
  franchiseeRate?: number;
  /** Updates the product-master MRP, shared by every branch. */
  mrp?: number;
  /** 0 for a new price row, otherwise the version last read. */
  version: number;
}

export interface BulkUpdateBranchPricesInput {
  branchId: UUID;
  items: BranchPriceUpdateEntry[];
}
