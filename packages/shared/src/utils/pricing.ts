const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Taxable base per box before GST. */
export const calculateTaxableBase = (
  purchaseRate: number,
  transportRate: number,
  additionalRate: number,
): number => round2(purchaseRate + transportRate + additionalRate);

/** GST amount per box charged on the taxable base. */
export const calculateGstAmount = (
  purchaseRate: number,
  transportRate: number,
  additionalRate: number,
  gstRate: number,
): number =>
  round2(calculateTaxableBase(purchaseRate, transportRate, additionalRate) * (gstRate / 100));

/**
 * Landing cost per box: (purchase + transport + additional) plus GST on that base.
 * Single source of truth shared by the API, worker and every frontend.
 */
export const calculateLandingCost = (
  purchaseRate: number,
  transportRate: number,
  additionalRate: number,
  gstRate: number,
): number => {
  const base = purchaseRate + transportRate + additionalRate;
  return round2(base * (1 + gstRate / 100));
};
