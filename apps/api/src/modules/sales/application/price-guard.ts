import { checkPrice, ForbiddenError } from '@tiles-erp/shared';

/** What the guard needs to know about the person pricing the line. */
export interface PricingRights {
  /** May price below the branch minimum. */
  canOverridePrice: boolean;
  /** May price below what the goods cost. A separate decision, deliberately. */
  canSellBelowCost: boolean;
  /**
   * May raise a document that puts the customer past their credit limit.
   *
   * Checked when the document is created, not only when it is posted. A draft that can
   * never be posted is a promise already made to a customer, and discovering the limit at
   * posting means the goods have usually been picked.
   */
  canOverrideCredit: boolean;
}

export interface GuardedLine {
  label: string;
  netRate: number;
  landingCost: number | null;
  minSellingPrice: number | null;
}

/**
 * Refuses a price that breaks a rule the actor is not allowed to break.
 *
 * One function for quotations, orders and invoices. Before this, each enforced its own
 * version and the invoice enforced none at all — so a counter sale raised straight as an
 * invoice, which is exactly where discounts get given, walked past the floor entirely.
 *
 * Below cost is checked apart from the branch minimum on purpose. The minimum is typed by
 * a person and can be set below landing cost by mistake; when that happens the floor
 * passes and the sale still loses money, which is the case a floor exists to catch.
 *
 * A thin margin is not raised here. It is a warning for the screen to show, not a wall —
 * clearing an old shade lot at 4% is sometimes the right call, and a rule that cannot be
 * judged gets worked around rather than followed.
 */
export function guardPrice(line: GuardedLine, rights: PricingRights): void {
  const check = checkPrice({
    netRate: line.netRate,
    landingCost: line.landingCost,
    minSellingPrice: line.minSellingPrice,
  });

  if (check.verdict === 'BELOW_COST' && !rights.canSellBelowCost) {
    throw new ForbiddenError(
      `${line.label}: ${check.message} Selling below cost needs its own permission.`,
    );
  }
  if (check.verdict === 'BELOW_MIN' && !rights.canOverridePrice) {
    throw new ForbiddenError(
      `${line.label}: ${check.message} A price override permission is required.`,
    );
  }
}
