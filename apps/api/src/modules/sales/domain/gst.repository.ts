import type { Gstr1Return, GstSummary, UUID } from '@tiles-erp/shared-types';

export const GST_REPOSITORY = Symbol('GST_REPOSITORY');

export interface GstWindow {
  from: Date;
  to: Date;
  branchId?: UUID;
}

/** Port for the GST summary. Read-only: returns are filed from it, never through it. */
export interface GstRepository {
  summary(window: GstWindow): Promise<GstSummary>;
  /** The GSTR-1 sections for the period, ready to write into the offline workbook. */
  returnData(window: GstWindow): Promise<Gstr1Return>;
}
