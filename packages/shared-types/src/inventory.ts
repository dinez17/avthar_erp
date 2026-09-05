import type { ISODateString, UUID } from './common';
import type { ProductUom } from './product';
import type { PrintPartyBlock } from './sales';

export type MovementType =
  | 'OPENING'
  | 'PURCHASE'
  | 'PURCHASE_RETURN'
  | 'SALE'
  | 'SALE_RETURN'
  | 'ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  /** Goods out on a sample gate pass — no invoice, so the pass is the movement. */
  | 'SAMPLE_OUT'
  /** A returnable sample coming back in. */
  | 'SAMPLE_IN';

export type MovementDirection = 'IN' | 'OUT';

/** The stock-keeping dimensions a balance is held against. */
export interface StockKey {
  productId: UUID;
  branchId: UUID;
  godownId: UUID;
  gateId?: UUID | null;
  batchNo?: string | null;
  shade?: string | null;
}

/** A single posting in the append-only ledger. */
export interface StockMovementItem {
  id: UUID;
  productId: UUID;
  sku: string;
  productName: string;
  branchId: UUID;
  branchName: string;
  godownId: UUID;
  godownName: string;
  gateId: UUID | null;
  gateName: string | null;
  batchNo: string | null;
  shade: string | null;
  type: MovementType;
  direction: MovementDirection;
  qtyBoxes: number;
  refType: string | null;
  refNumber: string | null;
  reason: string | null;
  remarks: string | null;
  movementDate: ISODateString;
  createdBy: UUID | null;
}

/** Current on-hand quantity for one stock key. */
export interface StockBalanceItem {
  productId: UUID;
  sku: string;
  productName: string;
  brandName: string;
  sizeMm: string | null;
  branchId: UUID;
  branchName: string;
  godownId: UUID;
  godownName: string;
  gateId: UUID | null;
  gateName: string | null;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  /** Derived from the product's pieces-per-box. */
  qtyPieces: number;
  /** Derived from the product's sqft-per-box. */
  qtySqft: number;
  /** The product's conversion factor, so zero-stock rows can still accept loose pieces. */
  piecesPerBox: number;
  /** Drives how the quantity is presented: boxes+pieces, pieces only, or sq.ft. */
  baseUom: ProductUom;
  /** Per-box landing cost, so a screen can value a movement before posting it. */
  landingCost: number;
  gstRate: number;
}

/** One line of an opening-stock or adjustment posting. */
export interface StockEntryLine {
  productId: UUID;
  godownId: UUID;
  gateId?: UUID | null;
  batchNo?: string | null;
  shade?: string | null;
  /** Positive for IN, negative for OUT (adjustments only). */
  qtyBoxes: number;
}

export interface PostOpeningStockInput {
  branchId: UUID;
  movementDate?: ISODateString;
  remarks?: string;
  lines: StockEntryLine[];
}

export interface PostAdjustmentInput {
  branchId: UUID;
  reason: string;
  movementDate?: ISODateString;
  remarks?: string;
  lines: StockEntryLine[];
}

/** One line of a bulk "set the counted quantity" posting. */
export interface StockCountLine {
  productId: UUID;
  batchNo?: string | null;
  shade?: string | null;
  /** Counted full boxes. */
  boxes: number;
  /** Counted loose pieces, converted using the product's pieces-per-box. */
  pieces: number;
}

export interface BulkSetStockInput {
  branchId: UUID;
  godownId: UUID;
  gateId?: UUID | null;
  reason: string;
  movementDate?: ISODateString;
  remarks?: string;
  lines: StockCountLine[];
}

/** Per-line outcome so the UI can show exactly what changed. */
export interface BulkSetStockResultLine {
  productId: UUID;
  sku: string;
  previousBoxes: number;
  newBoxes: number;
  deltaBoxes: number;
}

export interface BulkSetStockResult {
  posted: number;
  unchanged: number;
  lines: BulkSetStockResultLine[];
}

/**
 * Where a transfer is.
 *
 * `IN_TRANSIT` is real: the goods have left the source godown and are on a lorry, so
 * they belong to neither godown's balance until someone books them in.
 */
export type TransferStatus = 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

/** The paper the goods travel on. See `transferDocumentType` for how it is decided. */
export type TransferDocumentType = 'DELIVERY_CHALLAN' | 'TAX_INVOICE';

/** One line of a stock transfer. */
export interface TransferLineInput {
  productId: UUID;
  batchNo?: string | null;
  shade?: string | null;
  /** Whole boxes being moved. */
  boxes: number;
  /** Loose pieces being moved, folded into boxes using the product's conversion. */
  pieces: number;
  /**
   * Per-box value for the document. Left out, the product's landing cost is used —
   * which is what the document should normally carry.
   */
  rate?: number;
}

export interface CreateTransferInput {
  fromBranchId: UUID;
  fromGodownId: UUID;
  toBranchId: UUID;
  toGodownId: UUID;
  transferDate?: ISODateString;
  remarks?: string;

  /** Who is carrying it. All optional: a forklift between two godowns needs none. */
  transporterId?: UUID | null;
  vehicleId?: UUID | null;
  driverId?: UUID | null;
  /** The transporter's own consignment note number. */
  lrNumber?: string;
  /** What the lorry costs you. A cost of moving your own stock, billed to nobody. */
  freightCharge?: number;

  distanceKm?: number;
  ewayBillNo?: string;
  ewayBillDate?: ISODateString;

  lines: TransferLineInput[];
}

/** One line as it arrived. Omit a line and it is treated as fully received. */
export interface ReceiveTransferLineInput {
  productId: UUID;
  batchNo?: string | null;
  shade?: string | null;
  /** Boxes actually counted in at the destination. */
  qtyReceived: number;
}

export interface ReceiveTransferInput {
  /** Who signed for it at the far end. Printed on the acknowledgement. */
  receivedByName: string;
  receivedAt?: ISODateString;
  receiptRemarks?: string;
  lines?: ReceiveTransferLineInput[];
}

export interface CancelTransferInput {
  reason: string;
}

export interface TransferLineItem {
  productId: UUID;
  sku: string;
  productName: string;
  hsnCode: string;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  /** Null until the transfer is received. */
  qtyReceived: number | null;
  /** What did not arrive. Zero on a full delivery, and while still in transit. */
  qtyShort: number;
  piecesPerBox: number;
  baseUom: ProductUom;
  rate: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
}

export interface StockTransferItem {
  id: UUID;
  transferNo: string;
  documentNo: string;
  documentType: TransferDocumentType;
  status: TransferStatus;

  fromBranchId: UUID;
  fromBranchName: string;
  fromGodownId: UUID;
  fromGodownName: string;
  toBranchId: UUID;
  toBranchName: string;
  toGodownId: UUID;
  toGodownName: string;

  fromGstin: string | null;
  toGstin: string | null;
  /** True when the two branches sit in different states, so the tax is IGST. */
  interState: boolean;

  transferDate: ISODateString;
  remarks: string | null;
  lineCount: number;
  totalBoxes: number;
  /** True when the transfer crosses branches. */
  interBranch: boolean;

  subTotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  grandTotal: number;

  transporterId: UUID | null;
  transporterName: string | null;
  vehicleId: UUID | null;
  vehicleNumber: string | null;
  driverId: UUID | null;
  driverName: string | null;
  driverPhone: string | null;
  lrNumber: string | null;
  freightCharge: number;

  distanceKm: number | null;
  ewayBillNo: string | null;
  ewayBillDate: ISODateString | null;
  /** True when the consignment value crosses the threshold and no number is recorded. */
  ewayBillMissing: boolean;

  receivedAt: ISODateString | null;
  receivedByName: string | null;
  receiptRemarks: string | null;
  /** Boxes that never arrived, across all lines. */
  totalShort: number;

  cancelledAt: ISODateString | null;
  cancelReason: string | null;

  lines?: TransferLineItem[];
}

/** Everything the printed challan or tax invoice needs in one call. */
export interface TransferPrintData {
  transfer: StockTransferItem;
  company: PrintPartyBlock;
  /** The consignor: the branch the goods left. */
  fromBranch: PrintPartyBlock;
  /** The consignee: the branch they are going to. */
  toBranch: PrintPartyBlock;
}
