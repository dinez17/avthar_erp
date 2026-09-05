const round4 = (value: number): number => Math.round(value * 10000) / 10000;

/** One square foot in square millimetres. */
export const SQ_MM_PER_SQ_FT = 92903.04;

export interface TileSize {
  lengthMm: number;
  widthMm: number;
}

/**
 * Reads "600x600", "600 X 1200", "600*600mm" into millimetres.
 *
 * Returns null rather than guessing when the string is not two numbers — a size nobody
 * can parse is a size nobody should be flagged over.
 */
export function parseSizeMm(sizeMm: string | null | undefined): TileSize | null {
  if (!sizeMm) return null;
  const match = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i.exec(sizeMm);
  if (!match) return null;

  const lengthMm = Number(match[1]);
  const widthMm = Number(match[2]);
  if (!Number.isFinite(lengthMm) || !Number.isFinite(widthMm)) return null;
  if (lengthMm <= 0 || widthMm <= 0) return null;
  return { lengthMm, widthMm };
}

/** The square feet one piece of that size covers. */
export function sqftPerPiece(size: TileSize): number {
  return round4((size.lengthMm * size.widthMm) / SQ_MM_PER_SQ_FT);
}

/**
 * What a box of this product should measure, from its size and piece count.
 *
 * Null when the size cannot be read — the figure on the product is then the only one
 * there is, and nothing can be said about it.
 */
export function expectedSqftPerBox(
  sizeMm: string | null | undefined,
  piecesPerBox: number,
): number | null {
  const size = parseSizeMm(sizeMm);
  if (!size || piecesPerBox <= 0) return null;
  return round4(sqftPerPiece(size) * piecesPerBox);
}

export type AreaVerdict = 'OK' | 'SUSPECT' | 'UNKNOWN';

export interface AreaCheck {
  verdict: AreaVerdict;
  /** What the size and piece count say a box should be. Null when unreadable. */
  expected: number | null;
  /** stored ÷ expected. 1 is agreement; 309 is the tile area in cm² typed by mistake. */
  ratio: number | null;
  /** What most likely happened, in the words someone would use to fix it. */
  likelyCause: string | null;
}

/**
 * Whether a product's stored sq.ft per box agrees with its own size.
 *
 * Worth checking because the figure is typed by hand and nothing downstream questions it:
 * a box recorded at 3,600 sq.ft instead of 11.63 makes stock valuation, margin and every
 * per-sq.ft price silently absurd, and the error is invisible until someone reads a
 * report and does not believe it.
 *
 * The tolerance is wide on purpose. Tiles are sold in nominal sizes — a "600x600" is
 * really 597x597 — and rounding, spacers and trade convention move the honest figure by a
 * few percent. Only a difference too large to be any of those is worth raising.
 */
export function checkSqftPerBox(
  sizeMm: string | null | undefined,
  piecesPerBox: number,
  storedSqftPerBox: number,
  tolerance = 0.1,
): AreaCheck {
  const expected = expectedSqftPerBox(sizeMm, piecesPerBox);
  if (expected === null || expected <= 0) {
    return { verdict: 'UNKNOWN', expected: null, ratio: null, likelyCause: null };
  }
  if (storedSqftPerBox <= 0) {
    return {
      verdict: 'SUSPECT',
      expected,
      ratio: 0,
      likelyCause: 'No area recorded at all',
    };
  }

  const ratio = round4(storedSqftPerBox / expected);
  if (Math.abs(ratio - 1) <= tolerance) {
    return { verdict: 'OK', expected, ratio, likelyCause: null };
  }

  return { verdict: 'SUSPECT', expected, ratio, likelyCause: nameTheMistake(ratio, piecesPerBox) };
}

/**
 * Names the mistake behind a ratio, where one is recognisable.
 *
 * Naming it matters more than flagging it. "3,600 is the tile's area in cm²" tells
 * someone what they did and what to type instead; "this looks wrong" leaves them
 * comparing spreadsheets.
 */
function nameTheMistake(ratio: number, piecesPerBox: number): string {
  const near = (value: number, target: number, slack = 0.15): boolean =>
    Math.abs(value / target - 1) <= slack;

  // A 600x600 tile is 3,600 cm², and 3,600 is what gets typed. The ratio is whatever
  // cm² per sq.ft works out to across the box.
  if (near(ratio, 929.03 / piecesPerBox) || near(ratio, 929.03)) {
    return 'Looks like the tile area in cm² rather than square feet';
  }
  if (near(ratio, 1 / 10.7639)) {
    return 'Looks like square metres rather than square feet';
  }
  if (near(ratio, 10.7639)) {
    return 'Looks like square metres converted the wrong way';
  }
  if (near(ratio, piecesPerBox) && piecesPerBox > 1) {
    return 'Looks like the area was multiplied by the piece count twice';
  }
  if (near(ratio, 1 / piecesPerBox) && piecesPerBox > 1) {
    return 'Looks like the area of one piece rather than the whole box';
  }
  if (ratio > 100) return 'Far larger than the size allows — check the units';
  if (ratio < 0.01) return 'Far smaller than the size allows — check the units';
  return ratio > 1
    ? 'Larger than the size allows'
    : 'Smaller than the size allows';
}
