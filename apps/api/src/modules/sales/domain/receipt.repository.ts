import type {
  CustomerDueSummary,
  CustomerLedger,
  CustomerReceiptItem,
  OpenInvoiceItem,
  OutstandingRow,
  Paginated,
  PaginationQuery,
  ReceiptMode,
  ReceiptPrintData,
  ReceiptStatus,
  UUID,
} from '@tiles-erp/shared-types';

export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY');

export interface ReceiptFilter {
  customerId?: UUID;
  branchId?: UUID;
  status?: ReceiptStatus;
}

export interface ResolvedAllocation {
  salesInvoiceId: UUID;
  amount: number;
}

export interface ResolvedPayment {
  mode: ReceiptMode;
  amount: number;
  referenceNo: string | null;
  /** The account the money landed in; null on receipts raised before accounts existed. */
  accountId: UUID | null;
  bankName: string | null;
}

export interface ReceiptWriteData {
  customerId: UUID;
  branchId: UUID;
  receiptDate: Date;
  /** MIXED when there is more than one payment line. */
  mode: ReceiptMode;
  payments: ResolvedPayment[];
  amount: number;
  allocatedAmount: number;
  remarks: string | null;
  allocations: ResolvedAllocation[];
}

/** Port for collections: receipts, their allocation, and the ledger they feed. */
export interface ReceiptRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextReceiptNumber(branchId?: UUID): Promise<string>;
  list(query: PaginationQuery, filter: ReceiptFilter): Promise<Paginated<CustomerReceiptItem>>;
  findById(id: UUID): Promise<CustomerReceiptItem | null>;
  create(number: string, data: ReceiptWriteData, createdBy: UUID): Promise<CustomerReceiptItem>;
  update(
    id: UUID,
    version: number,
    data: ReceiptWriteData,
    updatedBy: UUID,
  ): Promise<CustomerReceiptItem>;
  /** Applies the allocations to the invoices and marks the receipt POSTED. */
  post(id: UUID, version: number, postedBy: UUID): Promise<CustomerReceiptItem>;
  /** Takes the money back off the invoices and marks the receipt CANCELLED. */
  cancel(id: UUID, version: number, reason: string, cancelledBy: UUID): Promise<CustomerReceiptItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;

  /** Posted invoices with a balance, oldest first — what a receipt can settle. */
  openInvoices(customerId: UUID, branchId?: UUID): Promise<OpenInvoiceItem[]>;
  /** What the customer owes in total, before any money is entered. */
  dueSummary(customerId: UUID, branchId?: UUID): Promise<CustomerDueSummary>;
  /** The receipt plus the letterhead a printed copy needs. */
  printData(id: UUID): Promise<ReceiptPrintData | null>;
  assertCustomer(customerId: UUID, branchId: UUID): Promise<void>;
  ledger(customerId: UUID, from?: Date, to?: Date): Promise<CustomerLedger>;
  outstanding(branchId?: UUID): Promise<OutstandingRow[]>;
}
