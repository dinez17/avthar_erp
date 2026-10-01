import { excludeGst } from './pricing';
import { calculatePurchaseLine } from './purchase';

describe('GST-inclusive selling rates', () => {
  it('backs GST out before the sales line adds tax', () => {
    const taxableRate = excludeGst(420, 18);
    expect(taxableRate).toBe(355.93);
    expect(calculatePurchaseLine(1, taxableRate, 0, 18).lineTotal).toBe(420);
  });

  it('leaves a zero-tax selling rate unchanged', () => {
    expect(excludeGst(420, 0)).toBe(420);
  });
});
