import type { ISODateString, UUID } from './common';
import type { ProductUom } from './product';

/** One row of the stock valuation report. */
export interface StockValuationItem {
  productId: UUID;
  sku: string;
  productName: string;
  brandName: string;
  categoryName: string;
  branchName: string;
  godownName: string;
  qtyBoxes: number;
  piecesPerBox: number;
  baseUom: ProductUom;
  /** Per-box landing cost at the time of the report. */
  landingCost: number | null;
  /** qtyBoxes × landingCost; null when the product has no landing cost yet. */
  value: number | null;
}

export interface StockValuationSummary {
  totalBoxes: number;
  totalValue: number;
  /** Rows excluded from the total because they lack a landing cost. */
  unvaluedRows: number;
}

/** Ageing bucket for stock that has been sitting in a godown. */
export type AgeBucket = '0-30' | '31-60' | '61-90' | '90+';

export interface StockAgeingItem {
  productId: UUID;
  sku: string;
  productName: string;
  brandName: string;
  branchName: string;
  godownName: string;
  batchNo: string | null;
  qtyBoxes: number;
  piecesPerBox: number;
  baseUom: ProductUom;
  /** Date stock last arrived at this location. */
  lastInwardDate: ISODateString | null;
  ageDays: number | null;
  bucket: AgeBucket;
  value: number | null;
}

export interface StockAgeingSummary {
  buckets: Record<AgeBucket, { boxes: number; value: number }>;
}

/** A product whose on-hand quantity has fallen to or below its reorder level. */
export interface LowStockItem {
  productId: UUID;
  sku: string;
  productName: string;
  brandName: string;
  branchName: string;
  qtyBoxes: number;
  piecesPerBox: number;
  baseUom: ProductUom;
  reorderLevelBoxes: number;
  /** How far below the reorder level, in boxes. */
  shortfallBoxes: number;
  /** Boxes still pending on approved purchase orders for this product and branch. */
  onOrderBoxes: number;
  /** Shortfall after allowing for what is already on order; zero when covered. */
  netShortfallBoxes: number;
  /** Open orders covering this product, for the drill-down. */
  openOrders: LowStockOpenOrder[];
}

/** One open purchase order contributing to a product's pending quantity. */
export interface LowStockOpenOrder {
  orderId: UUID;
  poNumber: string;
  supplierName: string;
  orderDate: ISODateString;
  expectedDate: ISODateString | null;
  orderedBoxes: number;
  receivedBoxes: number;
  pendingBoxes: number;
}
