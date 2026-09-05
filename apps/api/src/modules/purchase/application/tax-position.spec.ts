import { addTax, emptyLeg, netTaxPosition } from './tax-position';

const FROM = new Date('2026-08-01');
const TO = new Date('2026-08-31');

const leg = (cgst: number, sgst: number, igst: number) =>
  addTax(emptyLeg(), cgst, sgst, igst);

describe('addTax', () => {
  it('keeps the total in step with the heads', () => {
    expect(leg(900, 900, 0)).toEqual({ cgst: 900, sgst: 900, igst: 0, total: 1800 });
  });

  it('accumulates', () => {
    const once = leg(900, 900, 0);
    expect(addTax(once, 450, 450, 0)).toEqual({
      cgst: 1350,
      sgst: 1350,
      igst: 0,
      total: 2700,
    });
  });

  it('does not accumulate float dust', () => {
    let acc = emptyLeg();
    for (let i = 0; i < 3; i += 1) acc = addTax(acc, 0.1, 0.2, 0);
    expect(acc).toEqual({ cgst: 0.3, sgst: 0.6, igst: 0, total: 0.9 });
  });
});

describe('netTaxPosition', () => {
  it('nets input against output and leaves the balance payable', () => {
    const position = netTaxPosition(FROM, TO, leg(9000, 9000, 0), leg(4000, 4000, 0), 0);

    expect(position.net).toEqual({ cgst: 5000, sgst: 5000, igst: 0, total: 10000 });
    expect(position.payable).toBe(10000);
    expect(position.creditCarriedForward).toBe(0);
  });

  it('carries a surplus forward rather than refunding it', () => {
    const position = netTaxPosition(FROM, TO, leg(1000, 1000, 0), leg(4000, 4000, 0), 0);

    expect(position.payable).toBe(0);
    expect(position.creditCarriedForward).toBe(6000);
  });

  /**
   * The reason this is netted head by head: a comfortable-looking total can hide a real
   * liability on one head and unusable credit on another.
   */
  it('will not let CGST credit pay an SGST liability', () => {
    // Output SGST 5,000; input CGST 5,000. The totals cancel, the heads do not.
    const position = netTaxPosition(FROM, TO, leg(0, 5000, 0), leg(5000, 0, 0), 0);

    expect(position.net.total).toBe(0);
    expect(position.payable).toBe(5000);
    expect(position.creditCarriedForward).toBe(5000);
  });

  it('handles an inter-state period, where everything is IGST', () => {
    const position = netTaxPosition(FROM, TO, leg(0, 0, 18000), leg(0, 0, 7000), 0);

    expect(position.net.igst).toBe(11000);
    expect(position.payable).toBe(11000);
  });

  it('reports tax that cannot be claimed separately, without netting it', () => {
    const position = netTaxPosition(FROM, TO, leg(9000, 9000, 0), leg(4000, 4000, 0), 750);

    expect(position.ineligibleInput).toBe(750);
    // The unclaimable tax is a cost, not a credit, so it does not reduce what is payable.
    expect(position.payable).toBe(10000);
  });

  it('is all zeros for a period with no trade', () => {
    const position = netTaxPosition(FROM, TO, emptyLeg(), emptyLeg(), 0);

    expect(position.payable).toBe(0);
    expect(position.creditCarriedForward).toBe(0);
    expect(position.net.total).toBe(0);
  });
});
