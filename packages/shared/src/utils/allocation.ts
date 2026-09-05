const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** A place stock can be drawn from, with how much of it is free. */
export interface StockSource {
  branchId: string;
  godownId: string;
  batchNo: string | null;
  shade: string | null;
  availableQtyBoxes: number;
}

export interface Draw<T extends StockSource> {
  source: T;
  qtyBoxes: number;
}

/**
 * Orders the places stock can come from.
 *
 * The home branch first, always. Selling from the branch that took the order is what
 * everyone expects, keeps the goods where the customer is, and raises one invoice
 * instead of two — so another branch is a fallback, never a preference, however much
 * stock it happens to be sitting on.
 *
 * Within a branch the order given is kept, which is oldest batch first: the caller
 * sorted for that, and shuffling it here would quietly change which batch ships.
 */
export function preferHomeBranch<T extends StockSource>(sources: T[], homeBranchId: string): T[] {
  return [
    ...sources.filter((source) => source.branchId === homeBranchId),
    ...sources.filter((source) => source.branchId !== homeBranchId),
  ];
}

/**
 * Draws a quantity from the sources in the order given, taking what each has.
 *
 * Returns what could not be found rather than throwing, because the caller knows
 * whether a shortfall is fatal — quoting will happily show one, confirming will not.
 */
export function drawFromSources<T extends StockSource>(
  qtyBoxes: number,
  sources: T[],
): { draws: Draw<T>[]; shortfall: number } {
  let outstanding = round3(qtyBoxes);
  const draws: Draw<T>[] = [];

  for (const source of sources) {
    if (outstanding <= 0) break;
    if (source.availableQtyBoxes <= 0) continue;
    const take = round3(Math.min(source.availableQtyBoxes, outstanding));
    outstanding = round3(outstanding - take);
    draws.push({ source, qtyBoxes: take });
  }

  return { draws, shortfall: Math.max(outstanding, 0) };
}

/**
 * The branches a set of draws will pull from, in the order they were first drawn on.
 *
 * This is the invoice split: one invoice per branch, and the home branch leads because
 * it was offered the stock first.
 */
export function supplyingBranches<T extends StockSource>(draws: Draw<T>[]): string[] {
  const seen: string[] = [];
  for (const draw of draws) {
    if (!seen.includes(draw.source.branchId)) seen.push(draw.source.branchId);
  }
  return seen;
}

/** How much of a draw set comes from one branch. */
export function qtyFromBranch<T extends StockSource>(draws: Draw<T>[], branchId: string): number {
  return round3(
    draws
      .filter((draw) => draw.source.branchId === branchId)
      .reduce((sum, draw) => sum + draw.qtyBoxes, 0),
  );
}
