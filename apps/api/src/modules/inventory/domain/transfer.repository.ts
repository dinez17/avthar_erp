import type {
  Paginated,
  PaginationQuery,
  StockTransferItem,
  TransferDocumentType,
  TransferPrintData,
  TransferStatus,
  UUID,
} from '@tiles-erp/shared-types';
import type { MovementPosting } from './stock.repository';

export const TRANSFER_REPOSITORY = Symbol('TRANSFER_REPOSITORY');

export interface TransferRecordLine {
  productId: UUID;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  rate: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
}

export interface TransferRecord {
  transferNo: string;
  documentNo: string;
  documentType: TransferDocumentType;
  fromBranchId: UUID;
  fromGodownId: UUID;
  toBranchId: UUID;
  toGodownId: UUID;
  fromGstin: string | null;
  toGstin: string | null;
  interState: boolean;
  transferDate: Date;
  remarks: string | null;

  subTotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  grandTotal: number;

  transporterId: UUID | null;
  vehicleId: UUID | null;
  driverId: UUID | null;
  lrNumber: string | null;
  freightCharge: number;

  distanceKm: number | null;
  ewayBillNo: string | null;
  ewayBillDate: Date | null;

  createdBy: UUID;
  lines: TransferRecordLine[];
}

/** What the two branches are, as far as the document is concerned. */
export interface TransferEndpointFacts {
  fromGstin: string | null;
  toGstin: string | null;
  fromStateCode: string | null;
  toStateCode: string | null;
}

/** A line as it was counted in, keyed the same way stock is. */
export interface ReceiptLine {
  productId: UUID;
  batchNo: string | null;
  shade: string | null;
  qtyReceived: number;
}

export interface ReceiveTransferRecord {
  id: UUID;
  receivedAt: Date;
  receivedBy: UUID;
  receivedByName: string;
  receiptRemarks: string | null;
  lines: ReceiptLine[];
}

export interface CancelTransferRecord {
  id: UUID;
  cancelledAt: Date;
  cancelledBy: UUID;
  reason: string;
}

export interface TransferListFilter {
  branchId?: UUID;
  status?: TransferStatus;
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Port for stock transfers.
 *
 * A transfer posts in two legs: OUT when it is dispatched and IN when it is received.
 * In between the goods are on a lorry and belong to neither godown, which is the truth
 * the ledger should tell.
 */
export interface TransferRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextTransferNo(branchId?: UUID): Promise<string>;
  /** The next number in the challan or the tax-invoice series, whichever applies. */
  nextDocumentNo(type: TransferDocumentType, branchId?: UUID): Promise<string>;
  /** Persists the transfer and posts the OUT leg in one transaction. */
  create(record: TransferRecord, postings: MovementPosting[]): Promise<StockTransferItem>;
  /** Books the goods in, posting the IN leg for what actually arrived. */
  receive(record: ReceiveTransferRecord, postings: MovementPosting[]): Promise<StockTransferItem>;
  /** Turns it back, posting the stock home to the source godown. */
  cancel(record: CancelTransferRecord, postings: MovementPosting[]): Promise<StockTransferItem>;
  list(query: PaginationQuery, filter: TransferListFilter): Promise<Paginated<StockTransferItem>>;
  findById(id: UUID): Promise<StockTransferItem | null>;
  printData(id: UUID): Promise<TransferPrintData | null>;
  /** Validates that both endpoints exist and the godowns belong to their branches. */
  assertEndpoints(record: {
    fromBranchId: UUID;
    fromGodownId: UUID;
    toBranchId: UUID;
    toGodownId: UUID;
  }): Promise<TransferEndpointFacts>;
  /** Landing cost and GST rate per product, for valuing the document. */
  productValuation(productIds: UUID[]): Promise<Map<string, { rate: number; gstRate: number }>>;
  /** The carrier's names, so an unknown transporter or vehicle fails before posting. */
  assertCarrier(record: {
    transporterId: UUID | null;
    vehicleId: UUID | null;
    driverId: UUID | null;
  }): Promise<void>;
}
