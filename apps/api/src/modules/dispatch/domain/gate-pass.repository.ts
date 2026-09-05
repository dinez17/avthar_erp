import type {
  GatePassItem,
  GatePassPrintData,
  GatePassStatus,
  GatePassType,
  Paginated,
  PaginationQuery,
  PendingDispatchInvoice,
  UUID,
} from '@tiles-erp/shared-types';

export const GATE_PASS_REPOSITORY = Symbol('GATE_PASS_REPOSITORY');

export interface GatePassFilter {
  branchId?: UUID;
  customerId?: UUID;
  type?: GatePassType;
  status?: GatePassStatus;
  from?: Date;
  to?: Date;
}

/** A line as the handlers have resolved it, ready for the database. */
export interface ResolvedGatePassLine {
  /** Which of the pass's documents this line belongs to, by input key. */
  documentKey: string | null;
  productId: UUID;
  godownId: UUID;
  gateId: UUID | null;
  batchNo: string | null;
  shade: string | null;
  docQtyBoxes: number;
  boxes: number;
  pieces: number;
  qtyBoxes: number;
  remarks: string | null;
}

export interface ResolvedGatePassDocument {
  key: string;
  salesInvoiceId: UUID | null;
  stockTransferId: UUID | null;
  customerId: UUID | null;
  customerName: string | null;
  deliveryAddress: string | null;
  sequence: number;
  freightCharge: number;
  billedFreight: number;
  documentNumber: string;
  documentDate: Date;
  documentValue: number;
}

export interface GatePassWriteData {
  type: GatePassType;
  branchId: UUID;
  gateId: UUID | null;
  passDate: Date;
  customerId: UUID | null;
  toBranchId: UUID | null;
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
  billedFreight: number;
  returnable: boolean;
  expectedReturnDate: Date | null;
  remarks: string | null;
  documents: ResolvedGatePassDocument[];
  lines: ResolvedGatePassLine[];
}

export interface DeliveryData {
  receivedByName: string;
  receivedByPhone: string | null;
  deliveredAt: Date;
  podRemarks: string | null;
}

/** What one drop settled, as the desk reconciles it on the driver's return. */
export interface DropSettlement {
  documentId: UUID;
  freightPaidAtBranch: number | null;
  freightCollected: number | null;
}

export interface CloseTripData {
  endKm: number | null;
  cashHandedOver: number;
  closeRemarks: string | null;
  settlements: DropSettlement[];
}

/** Port for dispatch: gate passes, their loading, and what is still waiting to go. */
export interface GatePassRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextGatePassNumber(branchId?: UUID): Promise<string>;
  list(query: PaginationQuery, filter: GatePassFilter): Promise<Paginated<GatePassItem>>;
  findById(id: UUID): Promise<GatePassItem | null>;
  create(number: string, data: GatePassWriteData, createdBy: UUID): Promise<GatePassItem>;
  update(id: UUID, version: number, data: GatePassWriteData, updatedBy: UUID): Promise<GatePassItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;

  /** Marks the load checked, or sends a checked load back to draft for correction. */
  setLoaded(id: UUID, version: number, loaded: boolean, actorId: UUID): Promise<GatePassItem>;
  /**
   * Lets the vehicle out, noting the odometer. This is where the invoice's dispatched
   * quantities move and, for a sample, where the stock movement is written.
   */
  gateOut(id: UUID, version: number, startKm: number | null, actorId: UUID): Promise<GatePassItem>;
  deliver(id: UUID, version: number, data: DeliveryData, actorId: UUID): Promise<GatePassItem>;
  /** The vehicle is back: closing reading, what each drop settled, cash counted in. */
  close(
    id: UUID,
    version: number,
    data: CloseTripData,
    actorId: UUID,
    /** Named on the handover the cash creates, so the desk shows who took it. */
    actorName: string,
  ): Promise<GatePassItem>;
  /** A returnable sample coming back, which writes the SAMPLE_IN movements. */
  recordReturn(id: UUID, version: number, actorId: UUID): Promise<GatePassItem>;
  cancel(id: UUID, version: number, reason: string, actorId: UUID): Promise<GatePassItem>;

  /** Posted invoices with something still on the floor — the dispatch worklist. */
  pendingDispatch(branchId?: UUID, customerId?: UUID): Promise<PendingDispatchInvoice[]>;
  /** The pass plus the letterhead a printed copy needs. */
  printData(id: UUID): Promise<GatePassPrintData | null>;
}
