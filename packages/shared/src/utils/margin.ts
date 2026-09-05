const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Rupees kept on a sale, and what fraction of the price that is. */
export interface Margin {
  /** Net rate less landing cost. Null when nothing is known about cost. */
  amount: number | null;
  /** Margin as a percentage of the net rate. Null when cost is unknown. */
  pct: number | null;
}

/**
 * What is left after the goods are paid for.
 *
 * Measured against the **net** rate — what the customer actually pays after discount —
 * because a discount comes out of margin and nowhere else. Measuring against the list
 * price would report a margin the business never earned.
 */
export function marginOn(netRate: number, landingCost: number | null): Margin {
  if (landingCost === null || !Number.isFinite(landingCost)) {
    return { amount: null, pct: null };
  }
  const amount = round2(netRate - landingCost);
  return { amount, pct: netRate > 0 ? round2((amount / netRate) * 100) : 0 };
}

/**
 * How a price stands against the rules, worst first.
 *
 * `BELOW_COST` and `BELOW_MIN` are separate on purpose. A branch minimum is typed by a
 * person and can itself be set below landing cost by mistake — when that happens the
 * minimum passes and the sale still loses money, which is exactly the case a floor is
 * supposed to catch. Cost is checked on its own so the two cannot mask each other.
 */
export type PriceVerdict = 'OK' | 'THIN' | 'BELOW_MIN' | 'BELOW_COST';

export interface PriceGuardInput {
  /** What the customer pays after discount. */
  netRate: number;
  landingCost: number | null;
  minSellingPrice: number | null;
  /** Margin percent below which a sale is worth questioning. Zero disables the warning. */
  marginFloorPct?: number;
}

export interface PriceCheck {
  verdict: PriceVerdict;
  margin: Margin;
  /** Why, in the words someone at a counter would want to read. Null when fine. */
  message: string | null;
  /** Whether this needs a permission rather than merely a second thought. */
  blocking: boolean;
}

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function checkPrice(input: PriceGuardInput): PriceCheck {
  const margin = marginOn(input.netRate, input.landingCost);

  if (input.landingCost !== null && input.netRate < input.landingCost - 0.005) {
    return {
      verdict: 'BELOW_COST',
      margin,
      blocking: true,
      message: `${money(input.netRate)} is below the ${money(input.landingCost)} these goods cost. This sale loses ${money(Math.abs(margin.amount ?? 0))} a box.`,
    };
  }

  if (input.minSellingPrice !== null && input.netRate < input.minSellingPrice - 0.005) {
    return {
      verdict: 'BELOW_MIN',
      margin,
      blocking: true,
      message: `${money(input.netRate)} is below the branch minimum of ${money(input.minSellingPrice)}.`,
    };
  }

  const floor = input.marginFloorPct ?? 0;
  if (floor > 0 && margin.pct !== null && margin.pct < floor) {
    return {
      verdict: 'THIN',
      margin,
      // A warning, not a wall. Thin is sometimes the right call — clearing old shade lots,
      // a first order from a customer worth having — and a rule that cannot be judged
      // gets worked around rather than followed.
      blocking: false,
      message: `${margin.pct.toFixed(1)}% margin is under the ${floor}% floor.`,
    };
  }

  return { verdict: 'OK', margin, blocking: false, message: null };
}

/** Totals a set of lines, for the running margin on a whole document. */
export function totalMargin(
  lines: { netRate: number; qtyBoxes: number; landingCost: number | null }[],
): { revenue: number; cost: number; margin: number; marginPct: number; linesWithoutCost: number } {
  let revenue = 0;
  let cost = 0;
  let linesWithoutCost = 0;

  for (const line of lines) {
    revenue = round2(revenue + line.netRate * line.qtyBoxes);
    if (line.landingCost === null) {
      linesWithoutCost += 1;
      continue;
    }
    cost = round2(cost + line.landingCost * line.qtyBoxes);
  }

  const margin = round2(revenue - cost);
  return {
    revenue,
    cost,
    margin,
    marginPct: revenue > 0 ? round2((margin / revenue) * 100) : 0,
    linesWithoutCost,
  };
}
