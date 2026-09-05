import { isInterStateSupply, splitGst } from './gst';

describe('isInterStateSupply', () => {
  it('is intra-state when both sides share a state code', () => {
    expect(isInterStateSupply('33', '33')).toBe(false);
  });

  it('is inter-state when the codes differ', () => {
    expect(isInterStateSupply('33', '29')).toBe(true);
  });

  it('treats a missing code as intra-state, the safe counter-sale default', () => {
    expect(isInterStateSupply('33', null)).toBe(false);
    expect(isInterStateSupply(null, '29')).toBe(false);
  });

  it('ignores stray whitespace', () => {
    expect(isInterStateSupply(' 33', '33 ')).toBe(false);
  });
});

describe('splitGst', () => {
  it('halves the tax into CGST and SGST within the state', () => {
    expect(splitGst(66.83, false)).toEqual({ cgst: 33.42, sgst: 33.41, igst: 0, total: 66.83 });
  });

  it('never loses a paisa when halving', () => {
    const split = splitGst(0.05, false);
    expect(split.cgst + split.sgst).toBe(0.05);
  });

  it('puts the whole tax in IGST across state lines', () => {
    expect(splitGst(66.83, true)).toEqual({ cgst: 0, sgst: 0, igst: 66.83, total: 66.83 });
  });

  it('handles a zero-rated line', () => {
    expect(splitGst(0, false)).toEqual({ cgst: 0, sgst: 0, igst: 0, total: 0 });
  });
});
