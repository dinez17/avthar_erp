import type { TaxLeg, TaxPosition } from '@tiles-erp/shared-types';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const emptyLeg = (): TaxLeg => ({ cgst: 0, sgst: 0, igst: 0, total: 0 });

/** Adds tax into a leg, keeping the total in step with the heads. */
export function addTax(leg: TaxLeg, cgst: number, sgst: number, igst: number): TaxLeg {
  return {
    cgst: round2(leg.cgst + cgst),
    sgst: round2(leg.sgst + sgst),
    igst: round2(leg.igst + igst),
    total: round2(leg.total + cgst + sgst + igst),
  };
}

/**
 * Nets the period's input credit against its output tax.
 *
 * **Head by head, not on the total.** CGST is set off against CGST, SGST against SGST, and
 * IGST against either — but a surplus of CGST cannot pay an SGST liability. Netting the
 * grand totals would show a comfortable zero for a period that in fact owes SGST and is
 * carrying CGST credit it cannot spend, which is precisely the mistake this exists to
 * avoid. IGST set-off ordering is not modelled here: the return decides that, and this
 * report is for seeing the position, not for filing from.
 *
 * A negative head is credit carried forward rather than money coming back — tax paid on
 * purchases is not refunded, it waits for the next period's sales.
 */
export function netTaxPosition(
  from: Date,
  to: Date,
  output: TaxLeg,
  input: TaxLeg,
  ineligibleInput: number,
): TaxPosition {
  const net: TaxLeg = {
    cgst: round2(output.cgst - input.cgst),
    sgst: round2(output.sgst - input.sgst),
    igst: round2(output.igst - input.igst),
    total: round2(output.total - input.total),
  };

  const heads = [net.cgst, net.sgst, net.igst];

  return {
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
    output,
    input,
    ineligibleInput: round2(ineligibleInput),
    net,
    payable: round2(heads.reduce((sum, head) => sum + Math.max(0, head), 0)),
    creditCarriedForward: round2(
      heads.reduce((sum, head) => sum + Math.max(0, -head), 0),
    ),
  };
}
