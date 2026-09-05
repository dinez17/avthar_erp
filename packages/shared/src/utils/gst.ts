const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface GstSplit {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * Splits a line's GST by place of supply. Within the seller's own state the tax is
 * halved into CGST and SGST; anywhere else the whole amount is IGST.
 *
 * A missing state code on either side is treated as intra-state, which is the safe
 * default for a counter sale to a walk-in customer in the same shop.
 */
export function splitGst(gstAmount: number, interState: boolean): GstSplit {
  const total = round2(gstAmount);
  if (interState) {
    return { cgst: 0, sgst: 0, igst: total, total };
  }
  // Halving can leave a paisa behind, so give it to CGST and derive SGST from the rest.
  const cgst = round2(total / 2);
  return { cgst, sgst: round2(total - cgst), igst: 0, total };
}

/**
 * True when the supply crosses a state border and therefore attracts IGST. Both GST
 * state codes are the two-digit codes stored on the branch and the customer.
 */
export function isInterStateSupply(
  branchStateCode: string | null | undefined,
  customerStateCode: string | null | undefined,
): boolean {
  if (!branchStateCode || !customerStateCode) return false;
  return branchStateCode.trim() !== customerStateCode.trim();
}
