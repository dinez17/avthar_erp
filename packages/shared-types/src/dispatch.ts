import type { AgeingBucket, ISODateString, UUID } from './common';
import type { DispatchStatus, PrintPartyBlock } from './sales';

/**
 * What a gate pass is carrying.
 *
 * The distinction matters for stock: SALES and TRANSFER passes sit over movements the
 * invoice or the transfer has already written, so gating one out moves nothing. A SAMPLE
 * pass has no document behind it, so gating it out *is* the movement.
 */
export type GatePassType = 'SALES' | 'TRANSFER' | 'SAMPLE';

export type GatePassStatus =
  | 'DRAFT'
  | 'LOADED'
  | 'GATED_OUT'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED';

export interface GatePassDocumentItem {
  id: UUID;
  salesInvoiceId: UUID | null;
  stockTransferId: UUID | null;
  /** Whose goods these are. Null for a transfer, which goes to a branch. */
  customerId: UUID | null;
  customerName: string | null;
  /** The drop address for this document, where it differs from the customer's own. */
  deliveryAddress: string | null;
  /** The order the drops are made in on a multi-customer round. */
  sequence: number;
  /** What this customer is charged for this drop, printed for the driver to collect. */
  freightCharge: number;
  /** What their invoice already billed for freight; a paid drop is not collected again. */
  billedFreight: number;
  /** Settled at the counter, often while the lorry was out. */
  freightPaidAtBranch: number;
  /** What the driver took at the door. */
  freightCollected: number;
  /** What the driver should ask for: the charge less what is already settled. */
  freightToCollect: number;
  /** Still unpaid after the trip: `freightToCollect - freightCollected`. */
  freightOutstanding: number;
  documentNumber: string;
  documentDate: ISODateString;
  documentValue: number;
  /** Boxes loaded against this document. */
  qtyBoxes: number;
}

export interface GatePassLineItem {
  id: UUID;
  documentId: UUID | null;
  documentNumber: string | null;
  productId: UUID;
  productCode: string;
  productName: string;
  piecesPerBox: number;
  baseUom: string;
  godownId: UUID;
  godownName: string;
  gateId: UUID | null;
  batchNo: string | null;
  shade: string | null;
  /** What the document says should go. Zero for a sample, which has no document. */
  docQtyBoxes: number;
  boxes: number;
  pieces: number;
  /** What was actually loaded. */
  qtyBoxes: number;
  /** `docQtyBoxes - qtyBoxes`; positive means a short load. */
  shortQtyBoxes: number;
  remarks: string | null;
}

export interface GatePassItem {
  id: UUID;
  gatePassNo: string;
  type: GatePassType;
  status: GatePassStatus;
  branchId: UUID;
  branchName: string;
  gateId: UUID | null;
  gateName: string | null;
  passDate: ISODateString;

  /** Set for a sample, and for a sales pass whose invoices share one customer. */
  customerId: UUID | null;
  customerName: string | null;
  /** Every customer aboard, in drop order — a delivery round carries several. */
  customerNames: string[];
  toBranchId: UUID | null;
  toBranchName: string | null;
  destination: string | null;

  transporterId: UUID | null;
  vehicleId: UUID | null;
  driverId: UUID | null;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  transporterName: string | null;

  hireCharge: number;
  advancePaid: number;
  /** What the customers were billed for freight on the invoices aboard. */
  billedFreight: number;
  /** The per-drop charges added up — what the round earns in freight. */
  chargedFreight: number;
  /** Of that, what the driver has to collect at the door. */
  freightToCollect: number;
  /** What the driver actually collected, summed across the drops. */
  freightCollected: number;
  /** What is still unpaid after the trip. */
  freightOutstanding: number;
  /** `chargedFreight - hireCharge`: what the round made or cost. */
  freightMargin: number;

  /** The odometer at the gate, out and back. */
  startKm: number | null;
  endKm: number | null;
  /** `endKm - startKm`, once both are known. */
  tripKm: number | null;
  closedAt: ISODateString | null;
  /** Counted at the desk when the driver hands the cash in. */
  cashHandedOver: number;
  /** `cashHandedOver - freightCollected`; anything but zero wants explaining. */
  cashVariance: number;
  closeRemarks: string | null;

  returnable: boolean;
  expectedReturnDate: ISODateString | null;
  returnedAt: ISODateString | null;

  loadedAt: ISODateString | null;
  gatedOutAt: ISODateString | null;
  deliveredAt: ISODateString | null;
  receivedByName: string | null;
  receivedByPhone: string | null;
  podRemarks: string | null;
  cancelReason: string | null;
  remarks: string | null;

  documentCount: number;
  lineCount: number;
  totalBoxes: number;
  /** True when any line was loaded short of what its document says. */
  hasShortLoad: boolean;

  version: number;
  documents?: GatePassDocumentItem[];
  lines?: GatePassLineItem[];
}

export interface GatePassLineInput {
  /** Omitted for a sample line, which belongs to no document. */
  documentKey?: string;
  productId: UUID;
  godownId: UUID;
  gateId?: UUID;
  batchNo?: string;
  shade?: string;
  docQtyBoxes?: number;
  boxes?: number;
  pieces?: number;
  remarks?: string;
}

export interface GatePassDocumentInput {
  /** Ties the pass's lines to this document before either has an id. */
  key: string;
  salesInvoiceId?: UUID;
  stockTransferId?: UUID;
  /** Where this drop goes, when it is not the customer's billing address. */
  deliveryAddress?: string;
  /** The order of the drops on a multi-customer round. */
  sequence?: number;
  /** What this customer is charged for this drop. */
  freightCharge?: number;
}

export interface CreateGatePassInput {
  type: GatePassType;
  branchId: UUID;
  gateId?: UUID;
  passDate?: ISODateString;
  /** Required for a sample; for a sales pass it is derived from the invoices aboard. */
  customerId?: UUID;
  toBranchId?: UUID;
  destination?: string;
  transporterId?: UUID;
  vehicleId?: UUID;
  driverId?: UUID;
  /** Only for a hired lorry that is not in the vehicle master. */
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  hireCharge?: number;
  advancePaid?: number;
  returnable?: boolean;
  expectedReturnDate?: ISODateString;
  remarks?: string;
  documents?: GatePassDocumentInput[];
  lines: GatePassLineInput[];
}

export interface UpdateGatePassInput extends Partial<CreateGatePassInput> {
  version: number;
}

export interface DeliverGatePassInput {
  version: number;
  receivedByName: string;
  receivedByPhone?: string;
  deliveredAt?: ISODateString;
  podRemarks?: string;
}

export interface GateOutInput {
  version: number;
  /** The odometer as the vehicle leaves, read at the gate. */
  startKm?: number;
}

/** What was settled for one drop, as the desk reconciles it on the driver's return. */
export interface DropSettlementInput {
  documentId: UUID;
  /** Paid at the counter rather than at the door. */
  freightPaidAtBranch?: number;
  /** Taken by the driver at the door. */
  freightCollected?: number;
}

export interface CloseTripInput {
  version: number;
  /** The odometer as the vehicle comes back in, read at the gate. */
  endKm?: number;
  /**
   * Cash counted at the desk there and then. Optional: the driver often closes the trip
   * at the gate and settles at the counter later, which is a handover of its own.
   */
  cashHandedOver?: number;
  closeRemarks?: string;
  settlements?: DropSettlementInput[];
}

// ---------------------------------------------------------------------
// Driver cash handovers
// ---------------------------------------------------------------------

/** A trip a driver still owes money on. */
export interface DriverDueTrip {
  gatePassId: UUID;
  gatePassNo: string;
  passDate: ISODateString;
  closedAt: ISODateString | null;
  customerNames: string[];
  /** What he took at the door. */
  collected: number;
  /** What has already reached the counter. */
  handedOver: number;
  /** `collected - handedOver`: what he is still carrying. */
  balance: number;
}

/** What a driver owes the branch, and which trips it came from. */
export interface DriverDueSummary {
  driverId: UUID | null;
  driverName: string;
  balance: number;
  trips: DriverDueTrip[];
}

export interface DriverCashHandoverLineItem {
  id: UUID;
  gatePassId: UUID;
  gatePassNo: string;
  passDate: ISODateString;
  amount: number;
}

export interface DriverCashHandoverItem {
  id: UUID;
  handoverNo: string;
  branchId: UUID;
  branchName: string;
  driverId: UUID | null;
  driverName: string;
  handoverDate: ISODateString;
  amount: number;
  receivedByName: string | null;
  remarks: string | null;
  /** The drawer the notes went into; null on handovers taken before accounts existed. */
  accountId: UUID | null;
  accountName: string | null;
  tripCount: number;
  version: number;
  lines?: DriverCashHandoverLineItem[];
}

export interface HandoverAllocationInput {
  gatePassId: UUID;
  amount: number;
}

export interface CreateHandoverInput {
  branchId: UUID;
  driverId?: UUID;
  /** Needed only for a driver who is not in the master. */
  driverName?: string;
  handoverDate?: ISODateString;
  amount: number;
  remarks?: string;
  /** Which drawer the notes went into. Recording it puts them in that account's book. */
  accountId?: UUID | null;
  /** Left out, the money clears the oldest trips first. */
  allocations?: HandoverAllocationInput[];
}

/** A posted invoice with something still to go out — the dispatch worklist. */
export interface PendingDispatchLine {
  salesInvoiceLineId: UUID;
  productId: UUID;
  productCode: string;
  productName: string;
  piecesPerBox: number;
  baseUom: string;
  godownId: UUID;
  godownName: string;
  gateId: UUID | null;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  dispatchedQtyBoxes: number;
  /** `qtyBoxes - dispatchedQtyBoxes`: what is still waiting on the floor. */
  pendingQtyBoxes: number;
}

export interface PendingDispatchInvoice {
  salesInvoiceId: UUID;
  invoiceNumber: string;
  invoiceDate: ISODateString;
  customerId: UUID;
  customerName: string;
  customerAddress: string | null;
  branchId: UUID;
  grandTotal: number;
  freightCharge: number;
  dispatchStatus: DispatchStatus;
  pendingQtyBoxes: number;
  lines: PendingDispatchLine[];
}

export interface GatePassPrintData {
  gatePass: GatePassItem;
  company: PrintPartyBlock;
  branch: PrintPartyBlock;
}

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

/** One customer's freight across the period: charged, settled, and still owed. */
export interface FreightCollectionRow {
  customerId: UUID | null;
  customerName: string;
  /** How many drops were made to them. */
  drops: number;
  charged: number;
  /** Of that, what their invoices had already billed. */
  billedOnInvoice: number;
  paidAtBranch: number;
  collectedByDriver: number;
  outstanding: number;
}

export interface FreightCollectionReport {
  from: ISODateString;
  to: ISODateString;
  rows: FreightCollectionRow[];
  totals: Omit<FreightCollectionRow, 'customerId' | 'customerName'>;
}

/** What a vehicle did over the period, and what it cost against what it earned. */
export interface VehicleRunningRow {
  vehicleId: UUID | null;
  vehicleNumber: string;
  transporterName: string | null;
  /** Trips closed in the period; only a closed trip has both odometer readings. */
  trips: number;
  /** Trips with both readings, which is what `km` is measured over. */
  measuredTrips: number;
  km: number;
  boxes: number;
  hireCharge: number;
  advancePaid: number;
  chargedFreight: number;
  margin: number;
  /** Hire per kilometre, null until some distance has been measured. */
  costPerKm: number | null;
}

export interface VehicleRunningReport {
  from: ISODateString;
  to: ISODateString;
  rows: VehicleRunningRow[];
  totals: Omit<
    VehicleRunningRow,
    'vehicleId' | 'vehicleNumber' | 'transporterName' | 'costPerKm'
  > & { costPerKm: number | null };
}

/** What a driver was sent to collect against what came back to the desk. */
export interface DriverCashRow {
  driverId: UUID | null;
  driverName: string;
  trips: number;
  toCollect: number;
  collected: number;
  cashHandedOver: number;
  /** `collected - cashHandedOver`: what the driver is still carrying. */
  stillWithDriver: number;
  /** Trips where the cash has not fully reached the counter. */
  tripsWithVariance: number;
}

export interface DriverCashReport {
  from: ISODateString;
  to: ISODateString;
  rows: DriverCashRow[];
  totals: Omit<DriverCashRow, 'driverId' | 'driverName'>;
}

/** A posted invoice with goods still in the godown, and how long they have sat. */
export interface PendingDispatchAgeRow {
  salesInvoiceId: UUID;
  invoiceNumber: string;
  invoiceDate: ISODateString;
  customerName: string;
  branchName: string;
  dispatchStatus: DispatchStatus;
  /** Days since the invoice was raised. */
  waitingDays: number;
  bucket: AgeingBucket;
  pendingQtyBoxes: number;
  /** The value still sitting in the godown, pro-rated by the quantity outstanding. */
  pendingValue: number;
  /** True when a gate pass went out short, so the rest is waiting on another trip. */
  partlyDispatched: boolean;
}

export interface PendingDispatchAgeReport {
  rows: PendingDispatchAgeRow[];
  /** Boxes waiting in each bucket. */
  buckets: Record<AgeingBucket, { invoices: number; boxes: number; value: number }>;
}
