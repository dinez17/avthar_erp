export type StockUom = 'BOX' | 'PIECE' | 'SQFT';

export interface SplitQuantity {
  /** Whole boxes. */
  boxes: number;
  /** Loose pieces left over after the whole boxes. */
  pieces: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Splits a fractional box quantity into whole boxes plus loose pieces, which is how
 * tile stock is counted and reported (e.g. 20.5 boxes of 4 = "20 box 2 pcs").
 */
export const splitBoxesPieces = (qtyBoxes: number, piecesPerBox: number): SplitQuantity => {
  if (piecesPerBox <= 0) return { boxes: Math.trunc(qtyBoxes), pieces: 0 };
  const totalPieces = Math.round(qtyBoxes * piecesPerBox);
  return {
    boxes: Math.trunc(totalPieces / piecesPerBox),
    pieces: totalPieces % piecesPerBox,
  };
};

/**
 * Formats stock for display according to the product's base unit:
 * - BOX   → "20 box 2 pcs" (pieces omitted when zero)
 * - PIECE → "82 pcs"
 * - SQFT  → "1312 sq.ft"
 */
export const formatStockQuantity = (
  qtyBoxes: number,
  piecesPerBox: number,
  sqftPerBox: number,
  baseUom: StockUom,
): string => {
  if (baseUom === 'PIECE') {
    return `${Math.round(qtyBoxes * piecesPerBox)} pcs`;
  }
  if (baseUom === 'SQFT') {
    return `${round2(qtyBoxes * sqftPerBox)} sq.ft`;
  }
  const { boxes, pieces } = splitBoxesPieces(qtyBoxes, piecesPerBox);
  return pieces > 0 ? `${boxes} box ${pieces} pcs` : `${boxes} box`;
};

/**
 * Formats a box quantity for a sales document, where only the box unit matters:
 * "10 box 1 pcs", or plain pieces for goods sold by the piece. A decimal box figure is
 * never shown to a customer or a counter clerk.
 */
export const formatBoxPieces = (
  qtyBoxes: number,
  piecesPerBox: number,
  pieceOnly = false,
): string => {
  const perBox = piecesPerBox > 0 ? piecesPerBox : 1;
  if (pieceOnly) return `${Math.round(qtyBoxes * perBox)} pcs`;

  const { boxes, pieces } = splitBoxesPieces(qtyBoxes, perBox);
  if (boxes === 0 && pieces === 0) return '0';
  if (boxes === 0) return `${pieces} pcs`;
  return pieces > 0 ? `${boxes} box ${pieces} pcs` : `${boxes} box`;
};
