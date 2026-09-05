const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface PurchaseLineAmounts {
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
}

/**
 * Line economics for a purchase document: discount applies to the gross line value,
 * GST is charged on the discounted amount. Shared so orders, GRNs and invoices agree.
 */
export const calculatePurchaseLine = (
  qtyBoxes: number,
  rate: number,
  discountPct: number,
  gstRate: number,
): PurchaseLineAmounts => {
  const gross = qtyBoxes * rate;
  const lineSubTotal = round2(gross * (1 - discountPct / 100));
  const lineGst = round2(lineSubTotal * (gstRate / 100));
  return { lineSubTotal, lineGst, lineTotal: round2(lineSubTotal + lineGst) };
};

export interface PurchaseTotals {
  subTotal: number;
  gstAmount: number;
  grandTotal: number;
}

/** Sums line amounts into document totals. */
export const sumPurchaseTotals = (lines: PurchaseLineAmounts[]): PurchaseTotals => {
  const subTotal = round2(lines.reduce((sum, l) => sum + l.lineSubTotal, 0));
  const gstAmount = round2(lines.reduce((sum, l) => sum + l.lineGst, 0));
  return { subTotal, gstAmount, grandTotal: round2(subTotal + gstAmount) };
};

/**
 * Apportions document-level charges (transport, handling) across lines in proportion
 * to their value, so each product's landing cost reflects its share of the freight.
 */
export const apportionCharge = (lineValues: number[], totalCharge: number): number[] => {
  const total = lineValues.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || totalCharge <= 0) return lineValues.map(() => 0);
  return lineValues.map((value) => round2((value / total) * totalCharge));
};
