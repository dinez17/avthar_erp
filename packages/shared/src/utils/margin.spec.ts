import { checkPrice, marginOn, totalMargin } from './margin';

describe('marginOn', () => {
  it('is the net rate less what the goods cost', () => {
    expect(marginOn(100, 80)).toEqual({ amount: 20, pct: 20 });
  });

  it('goes negative when sold under cost', () => {
    expect(marginOn(70, 80)).toEqual({ amount: -10, pct: -14.29 });
  });

  it('says nothing when cost is unknown', () => {
    expect(marginOn(100, null)).toEqual({ amount: null, pct: null });
  });

  it('does not divide by a zero rate', () => {
    expect(marginOn(0, 80)).toEqual({ amount: -80, pct: 0 });
  });
});

describe('checkPrice', () => {
  const base = { netRate: 100, landingCost: 80, minSellingPrice: 90, marginFloorPct: 10 };

  it('passes a price above everything', () => {
    expect(checkPrice(base).verdict).toBe('OK');
    expect(checkPrice(base).message).toBeNull();
  });

  it('blocks a sale below cost', () => {
    const check = checkPrice({ ...base, netRate: 70 });
    expect(check.verdict).toBe('BELOW_COST');
    expect(check.blocking).toBe(true);
    expect(check.message).toMatch(/loses/);
  });

  it('blocks a sale below the branch minimum', () => {
    const check = checkPrice({ ...base, netRate: 85 });
    expect(check.verdict).toBe('BELOW_MIN');
    expect(check.blocking).toBe(true);
  });

  it('catches a loss even when the branch minimum allows it', () => {
    // The case the separation exists for: somebody set the minimum below cost, so the
    // floor passes and the sale still loses money.
    const check = checkPrice({ netRate: 75, landingCost: 80, minSellingPrice: 70 });
    expect(check.verdict).toBe('BELOW_COST');
  });

  it('warns without blocking on a thin margin', () => {
    const check = checkPrice({ ...base, netRate: 85, minSellingPrice: 80 });
    expect(check.verdict).toBe('THIN');
    expect(check.blocking).toBe(false);
    expect(check.message).toMatch(/floor/);
  });

  it('says nothing about thinness when no floor is set', () => {
    expect(checkPrice({ ...base, netRate: 82, minSellingPrice: 80, marginFloorPct: 0 }).verdict).toBe(
      'OK',
    );
  });

  it('still checks the minimum when cost is unknown', () => {
    const check = checkPrice({ netRate: 85, landingCost: null, minSellingPrice: 90 });
    expect(check.verdict).toBe('BELOW_MIN');
  });

  it('passes when neither cost nor a minimum is known', () => {
    expect(checkPrice({ netRate: 85, landingCost: null, minSellingPrice: null }).verdict).toBe('OK');
  });

  it('allows selling exactly at cost and exactly at the minimum', () => {
    expect(checkPrice({ netRate: 80, landingCost: 80, minSellingPrice: 80 }).verdict).toBe('OK');
  });

  it('reports cost before the minimum when both are breached', () => {
    // Losing money is the more serious fact, and the message should say so first.
    const check = checkPrice({ netRate: 50, landingCost: 80, minSellingPrice: 90 });
    expect(check.verdict).toBe('BELOW_COST');
  });
});

describe('totalMargin', () => {
  it('adds up a document', () => {
    const result = totalMargin([
      { netRate: 100, qtyBoxes: 10, landingCost: 80 },
      { netRate: 200, qtyBoxes: 5, landingCost: 150 },
    ]);
    expect(result.revenue).toBe(2000);
    expect(result.cost).toBe(1550);
    expect(result.margin).toBe(450);
    expect(result.marginPct).toBe(22.5);
  });

  it('counts lines with no cost rather than treating them as free', () => {
    const result = totalMargin([
      { netRate: 100, qtyBoxes: 10, landingCost: 80 },
      { netRate: 100, qtyBoxes: 10, landingCost: null },
    ]);
    expect(result.linesWithoutCost).toBe(1);
    // Revenue counts both; cost counts only the line that has one, so the caller can see
    // the margin is overstated rather than being handed a confident wrong number.
    expect(result.revenue).toBe(2000);
    expect(result.cost).toBe(800);
  });

  it('handles an empty document', () => {
    expect(totalMargin([])).toEqual({
      revenue: 0,
      cost: 0,
      margin: 0,
      marginPct: 0,
      linesWithoutCost: 0,
    });
  });
});
