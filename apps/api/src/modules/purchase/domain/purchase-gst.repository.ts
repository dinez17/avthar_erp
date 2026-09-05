import type { PurchaseGstSummary, TaxPosition, UUID } from '@tiles-erp/shared-types';

export const PURCHASE_GST_REPOSITORY = Symbol('PURCHASE_GST_REPOSITORY');

export interface PurchaseGstWindow {
  from: Date;
  to: Date;
  branchId?: UUID;
}

/**
 * Port for the inward side of GST.
 *
 * Read-only, like its outward counterpart: a return is filed from these figures, never
 * through them.
 */
export interface PurchaseGstRepository {
  /** Inward supplies for the period, by rate, HSN and supplier. */
  summary(window: PurchaseGstWindow): Promise<PurchaseGstSummary>;
  /** Output tax on sales against input credit on purchases, netted head by head. */
  position(window: PurchaseGstWindow): Promise<TaxPosition>;
}
