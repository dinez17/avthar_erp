import type {
  OpenBillItem,
  OpenDebitNoteItem,
  Paginated,
  PaginationQuery,
  PayableRow,
  ReceiptMode,
  ReceiptStatus,
  SupplierDueSummary,
  SupplierLedger,
  SupplierPaymentItem,
  UUID,
} from '@tiles-erp/shared-types';

export const SUPPLIER_PAYMENT_REPOSITORY = Symbol('SUPPLIER_PAYMENT_REPOSITORY');

export interface SupplierPaymentFilter {
  supplierId?: UUID;
  branchId?: UUID;
  status?: ReceiptStatus;
}

export interface ResolvedTender {
  mode: ReceiptMode;
  amount: number;
  referenceNo: string | null;
  /** The account the money left; null on payments raised before accounts existed. */
  accountId: UUID | null;
  bankName: string | null;
}

export interface ResolvedBillAllocation {
  purchaseInvoiceId: UUID;
  amount: number;
}

export interface ResolvedDebitNote {
  purchaseReturnId: UUID;
  amount: number;
}

export interface SupplierPaymentWriteData {
  supplierId: UUID;
  branchId: UUID;
  paymentDate: Date;
  /** MIXED when there is more than one tender; BANK when there are none. */
  mode: ReceiptMode;
  tenders: ResolvedTender[];
  /** Cash that leaves. */
  amount: number;
  /** Credit spent instead of cash. */
  adjustedAmount: number;
  allocatedAmount: number;
  remarks: string | null;
  allocations: ResolvedBillAllocation[];
  debitNotes: ResolvedDebitNote[];
}

/** Port for payables: payments, what they settle, and the ledger they feed. */
export interface SupplierPaymentRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextPaymentNumber(branchId?: UUID): Promise<string>;
  list(
    query: PaginationQuery,
    filter: SupplierPaymentFilter,
  ): Promise<Paginated<SupplierPaymentItem>>;
  findById(id: UUID): Promise<SupplierPaymentItem | null>;
  create(
    number: string,
    data: SupplierPaymentWriteData,
    createdBy: UUID,
  ): Promise<SupplierPaymentItem>;
  update(
    id: UUID,
    version: number,
    data: SupplierPaymentWriteData,
    updatedBy: UUID,
  ): Promise<SupplierPaymentItem>;
  /** Applies the allocations to the bills, spends the debit notes, marks it POSTED. */
  post(id: UUID, version: number, postedBy: UUID): Promise<SupplierPaymentItem>;
  /** Takes the money back off the bills and returns the credit to the debit notes. */
  cancel(
    id: UUID,
    version: number,
    reason: string,
    cancelledBy: UUID,
  ): Promise<SupplierPaymentItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;

  /** Posted bills with a balance, soonest due first — what a payment can settle. */
  openBills(supplierId: UUID, branchId?: UUID): Promise<OpenBillItem[]>;
  /** Posted debit notes with credit left — what a payment can spend. */
  openDebitNotes(supplierId: UUID, branchId?: UUID): Promise<OpenDebitNoteItem[]>;
  /** What is owed to the supplier before any money is entered. */
  dueSummary(supplierId: UUID, branchId?: UUID): Promise<SupplierDueSummary>;
  assertSupplier(supplierId: UUID, branchId: UUID): Promise<void>;
  ledger(supplierId: UUID, from?: Date, to?: Date): Promise<SupplierLedger>;
  payables(branchId?: UUID): Promise<PayableRow[]>;
}
