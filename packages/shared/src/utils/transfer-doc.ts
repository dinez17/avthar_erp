import type { TransferDocumentType, TransferStatus } from '@tiles-erp/shared-types';
import { splitGst, type GstSplit } from './gst';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * The consignment value above which an e-way bill is required.
 *
 * One constant, because it appears on the entry screen, the printed document and the
 * warning that fires when someone forgets. States can set their own floor for movement
 * wholly inside the state; this is the central figure.
 */
export const EWAY_BILL_THRESHOLD = 50_000;

/**
 * Which document a transfer travels on.
 *
 * Moving your own stock between your own godowns is not a supply — there is no second
 * person for it to be supplied to — so it goes on a delivery challan under Rule 55, with
 * a value for transport but no tax.
 *
 * Two branches registered separately are two persons under GST, even inside one company.
 * A move between them is a supply, so it needs a real tax invoice that charges tax,
 * appears in the sending branch's GSTR-1 and gives the receiving branch input credit.
 *
 * A branch with no GSTIN on file cannot be a separate registration, so the safe answer
 * is the challan: issuing a tax invoice on a transfer that was never a supply overstates
 * outward supply and is far harder to unwind than the other mistake.
 */
export function transferDocumentType(
  fromGstin: string | null | undefined,
  toGstin: string | null | undefined,
): TransferDocumentType {
  const from = fromGstin?.trim();
  const to = toGstin?.trim();
  if (!from || !to) return 'DELIVERY_CHALLAN';
  return from.toUpperCase() === to.toUpperCase() ? 'DELIVERY_CHALLAN' : 'TAX_INVOICE';
}

export interface TransferLineValuation {
  qtyBoxes: number;
  /** Landing cost per box at the time, or whatever was typed over it. */
  rate: number;
  gstRate: number;
}

export interface ValuedTransferLine {
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
}

/**
 * Values one line.
 *
 * `taxable` is the document type talking: a challan states a value so the consignment can
 * be assessed at a checkpost and an e-way bill raised against it, but charges nothing.
 * Putting tax on a challan would invent an outward supply that never happened.
 */
export function valueTransferLine(
  line: TransferLineValuation,
  taxable: boolean,
): ValuedTransferLine {
  const lineSubTotal = round2(round3(line.qtyBoxes) * line.rate);
  const lineGst = taxable ? round2((lineSubTotal * line.gstRate) / 100) : 0;
  return { lineSubTotal, lineGst, lineTotal: round2(lineSubTotal + lineGst) };
}

export interface TransferTotals {
  subTotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  grandTotal: number;
}

/**
 * Rolls the lines up and splits the tax by place of supply.
 *
 * The split is taken on the total rather than line by line, and then the heads are
 * derived from it, so the three heads always add back to the tax charged — halving each
 * line separately can leave a paisa adrift across a long document.
 */
export function transferTotals(
  lines: ValuedTransferLine[],
  interState: boolean,
): TransferTotals {
  const subTotal = round2(lines.reduce((sum, line) => sum + line.lineSubTotal, 0));
  const gstAmount = round2(lines.reduce((sum, line) => sum + line.lineGst, 0));
  const split: GstSplit = splitGst(gstAmount, interState);
  return {
    subTotal,
    cgstAmount: split.cgst,
    sgstAmount: split.sgst,
    igstAmount: split.igst,
    gstAmount: split.total,
    grandTotal: round2(subTotal + split.total),
  };
}

/**
 * True when the consignment needs an e-way bill.
 *
 * The value tested is the whole consignment including tax, which is what the portal
 * asks for — so a challan and a tax invoice of the same goods can fall on either side
 * of the line.
 */
export function needsEwayBill(consignmentValue: number): boolean {
  return round2(consignmentValue) > EWAY_BILL_THRESHOLD;
}

/**
 * What went missing between the two godowns.
 *
 * Never negative: more cannot arrive than was sent, and if someone types more the
 * excess is a counting error at the far end, not stock that materialised on a lorry.
 */
export function shortQty(sent: number, received: number): number {
  return Math.max(0, round3(sent - received));
}

/**
 * Whether a transfer can still be received or turned back.
 *
 * A received transfer is closed — correcting a miscount afterwards is an adjustment
 * against the destination godown, with its own reason, not a second receipt that would
 * post the same goods in twice.
 */
export function isOpenTransfer(status: TransferStatus): boolean {
  return status === 'IN_TRANSIT';
}
