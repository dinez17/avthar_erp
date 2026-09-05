import type {
  Paginated,
  PaginationQuery,
  PurchaseInvoiceItem,
  SupplierRateItem,
  UUID,
} from '@tiles-erp/shared-types';

export const PURCHASE_INVOICE_REPOSITORY = Symbol('PURCHASE_INVOICE_REPOSITORY');

export interface ResolvedInvoiceLine {
  productId: UUID;
  qtyBoxes: number;
  rate: number;
  discountPct: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
  /** Per-box landing cost implied by this line, including apportioned charges. */
  impliedLandingCost: number;
}

export interface InvoiceWriteData {
  invoiceNumber: string;
  supplierInvoiceNo: string;
  supplierId: UUID;
  branchId: UUID;
  receiptId: UUID | null;
  invoiceDate: Date;
  dueDate: Date | null;
  transportCharge: number;
  additionalCharge: number;
  subTotal: number;
  gstAmount: number;
  grandTotal: number;
  remarks: string | null;
  createdBy: UUID;
  lines: ResolvedInvoiceLine[];
}

export interface InvoiceFilter {
  supplierId?: UUID;
  branchId?: UUID;
  status?: 'DRAFT' | 'POSTED' | 'CANCELLED';
  fromDate?: Date;
  toDate?: Date;
}

/** Port for purchase invoices and the supplier rate history they produce. */
export interface PurchaseInvoiceRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextInvoiceNumber(branchId?: UUID): Promise<string>;
  supplierInvoiceExists(
    supplierId: UUID,
    supplierInvoiceNo: string,
    excludeId?: UUID,
  ): Promise<boolean>;
  /**
   * The invoice already standing against a receipt, if there is one. A cancelled or
   * deleted invoice does not count — cancelling is what frees the receipt to be billed
   * again.
   */
  invoiceForReceipt(receiptId: UUID, excludeId?: UUID): Promise<string | null>;
  create(data: InvoiceWriteData): Promise<PurchaseInvoiceItem>;
  /** Replaces header and lines; only permitted while the invoice is a draft. */
  update(
    id: UUID,
    version: number,
    data: InvoiceWriteData,
    updatedBy: UUID,
  ): Promise<PurchaseInvoiceItem>;
  /**
   * Marks the invoice posted, writes supplier rate history and refreshes each
   * product's purchase rate and landing cost — all in one transaction.
   */
  post(id: UUID, version: number, actorId: UUID): Promise<PurchaseInvoiceItem>;
  list(query: PaginationQuery, filter: InvoiceFilter): Promise<Paginated<PurchaseInvoiceItem>>;
  findById(id: UUID): Promise<PurchaseInvoiceItem | null>;
  rateHistory(
    query: PaginationQuery,
    filter: { productId?: UUID; supplierId?: UUID },
  ): Promise<Paginated<SupplierRateItem>>;
  /** Supplier payment terms, used to default the due date. */
  supplierTermDays(supplierId: UUID): Promise<number>;
}
