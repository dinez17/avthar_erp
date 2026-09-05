import { formatBoxPieces, splitBoxesPieces } from './quantity';

describe('splitBoxesPieces', () => {
  it('splits a fractional box figure', () => {
    expect(splitBoxesPieces(20.5, 4)).toEqual({ boxes: 20, pieces: 2 });
  });

  it('handles a product with no pieces-per-box set', () => {
    expect(splitBoxesPieces(3.7, 0)).toEqual({ boxes: 3, pieces: 0 });
  });
});

describe('formatBoxPieces', () => {
  it('shows boxes and the loose pieces', () => {
    expect(formatBoxPieces(10.25, 4)).toBe('10 box 1 pcs');
  });

  it('omits the pieces when the quantity is whole boxes', () => {
    expect(formatBoxPieces(10, 4)).toBe('10 box');
  });

  it('shows pieces alone when there is not a full box', () => {
    expect(formatBoxPieces(0.5, 4)).toBe('2 pcs');
  });

  it('reports piece-only goods in pieces, never boxes', () => {
    expect(formatBoxPieces(1, 1, true)).toBe('1 pcs');
    expect(formatBoxPieces(12, 1, true)).toBe('12 pcs');
  });

  it('never prints a decimal box figure', () => {
    expect(formatBoxPieces(1.25, 4)).toBe('1 box 1 pcs');
    expect(formatBoxPieces(6.75, 4)).toBe('6 box 3 pcs');
  });

  it('shows a plain zero for an empty line', () => {
    expect(formatBoxPieces(0, 4)).toBe('0');
  });
});
