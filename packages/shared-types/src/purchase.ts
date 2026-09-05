import type { ISODateString, UUID } from './common';
import type { ProductUom } from './product';
import type { ReceiptMode, ReceiptStatus } from './sales';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface PurchaseOrderLineItem {
  id: UUID;
  productId: UUID;
  sku: string;
  productName: string;
  piecesPerBox: number;
  baseUom: ProductUom;
  qtyBoxes: number;
  rate: number;
  discountPct: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
  receivedBoxes: number;
  /** qtyBoxes − receivedBoxes. */
  pendingBoxes: number;
}

export interface PurchaseOrderItem {
  id: UUID;
  poNumber: string;
  supplierId: UUID;
  supplierName: string;
  branchId: UUID;
  branchName: string;
  orderDate: ISODateString;
  expectedDate: ISODateString | null;
  status: PurchaseOrderStatus;
  subTotal: number;
  gstAmount: number;
  grandTotal: number;
  remarks: string | null;
  lineCount: number;
  version: number;
  lines?: PurchaseOrderLineItem[];
}

export interface PurchaseOrderLineInput {
  productId: UUID;
  qtyBoxes: number;
  rate: number;
  discountPct?: number;
  /** Defaults to the product's GST rate when omitted. */
  gstRate?: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: UUID;
  branchId: UUID;
  orderDate?: ISODateString;
  expectedDate?: ISODateString;
  remarks?: string;
  lines: PurchaseOrderLineInput[];
}

export interface UpdatePurchaseOrderInput extends Partial<CreatePurchaseOrderInput> {
  version: number;
}

/** One line of a goods receipt. */
export interface GoodsReceiptLineInput {
  /** Order line being received against, when the receipt is order-linked. */
  orderLineId?: UUID | null;
  productId: UUID;
  batchNo?: string | null;
  shade?: string | null;
  /** Boxes received. */
  qtyBoxes: number;
  /** Rate the goods actually arrived at; defaults to the order line rate. */
  rate?: number;
}

export interface CreateGoodsReceiptInput {
  /** Optional: receive against an approved purchase order. */
  orderId?: UUID | null;
  supplierId: UUID;
  branchId: UUID;
  godownId: UUID;
  receiptDate?: ISODateString;
  supplierInvoiceNo?: string;
  remarks?: string;
  lines: GoodsReceiptLineInput[];
}

export interface GoodsReceiptLineItem {
  id: UUID;
  orderLineId: UUID | null;
  productId: UUID;
  sku: string;
  productName: string;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  rate: number;
  piecesPerBox: number;
  baseUom: ProductUom;
}

export interface GoodsReceiptItem {
  id: UUID;
  grnNumber: string;
  orderId: UUID | null;
  poNumber: string | null;
  supplierId: UUID;
  supplierName: string;
  branchId: UUID;
  branchName: string;
  godownId: UUID;
  godownName: string;
  receiptDate: ISODateString;
  supplierInvoiceNo: string | null;
  remarks: string | null;
  lineCount: number;
  totalBoxes: number;
  /** True once a purchase invoice stands against it; a cancelled one does not count. */
  invoiced: boolean;
  /** The invoices billed against this receipt, for the list to name them. */
  invoiceNumbers: string[];
  lines?: GoodsReceiptLineItem[];
}

export type PurchaseInvoiceStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export interface PurchaseInvoiceLineInput {
  productId: UUID;
  qtyBoxes: number;
  rate: number;
  discountPct?: number;
  gstRate?: number;
}

export interface CreatePurchaseInvoiceInput {
  supplierInvoiceNo: string;
  supplierId: UUID;
  branchId: UUID;
  /** Optional link to the receipt being billed. */
  receiptId?: UUID | null;
  invoiceDate?: ISODateString;
  dueDate?: ISODateString;
  transportCharge?: number;
  additionalCharge?: number;
  remarks?: string;
  lines: PurchaseInvoiceLineInput[];
}

export interface UpdatePurchaseInvoiceInput extends Partial<CreatePurchaseInvoiceInput> {
  version: number;
}

export interface PurchaseInvoiceLineItem {
  id: UUID;
  productId: UUID;
  sku: string;
  productName: string;
  piecesPerBox: number;
  baseUom: ProductUom;
  qtyBoxes: number;
  rate: number;
  discountPct: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
  /** Landing cost per box implied by this invoice, including apportioned charges. */
  impliedLandingCost: number;
}

export interface PurchaseInvoiceItem {
  id: UUID;
  invoiceNumber: string;
  supplierInvoiceNo: string;
  supplierId: UUID;
  supplierName: string;
  branchId: UUID;
  branchName: string;
  receiptId: UUID | null;
  grnNumber: string | null;
  invoiceDate: ISODateString;
  dueDate: ISODateString | null;
  status: PurchaseInvoiceStatus;
  transportCharge: number;
  additionalCharge: number;
  subTotal: number;
  gstAmount: number;
  grandTotal: number;
  remarks: string | null;
  lineCount: number;
  version: number;
  lines?: PurchaseInvoiceLineItem[];
}

/** One historical purchase rate for a supplier and product. */
export interface SupplierRateItem {
  id: UUID;
  supplierId: UUID;
  supplierName: string;
  productId: UUID;
  sku: string;
  productName: string;
  rate: number;
  landingCost: number;
  effectiveOn: ISODateString;
  invoiceNumber: string | null;
}

export type PurchaseReturnStatus = 'DRAFT' | 'POSTED';

export interface PurchaseReturnLineInput {
  productId: UUID;
  batchNo?: string | null;
  shade?: string | null;
  qtyBoxes: number;
  rate: number;
  gstRate?: number;
}

export interface CreatePurchaseReturnInput {
  supplierId: UUID;
  branchId: UUID;
  godownId: UUID;
  /** Optional link to the receipt the goods came in on. */
  receiptId?: UUID | null;
  returnDate?: ISODateString;
  reason: string;
  remarks?: string;
  lines: PurchaseReturnLineInput[];
}

export interface PurchaseReturnLineItem {
  id: UUID;
  productId: UUID;
  sku: string;
  productName: string;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  rate: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
  piecesPerBox: number;
  baseUom: ProductUom;
}

export interface PurchaseReturnItem {
  id: UUID;
  returnNumber: string;
  supplierId: UUID;
  supplierName: string;
  branchId: UUID;
  branchName: string;
  godownId: UUID;
  godownName: string;
  receiptId: UUID | null;
  grnNumber: string | null;
  returnDate: ISODateString;
  reason: string;
  remarks: string | null;
  status: PurchaseReturnStatus;
  subTotal: number;
  gstAmount: number;
  grandTotal: number;
  lineCount: number;
  totalBoxes: number;
  version: number;
  lines?: PurchaseReturnLineItem[];
}

// ---------------------------------------------------------------------
// Purchase GST: inward supplies and the input credit they carry
// ---------------------------------------------------------------------

/** Inward supplies at one tax rate. */
export interface PurchaseGstRateRow {
  gstRate: number;
  invoiceCount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

export interface PurchaseGstHsnRow {
  hsnCode: string;
  productCount: number;
  qtyBoxes: number;
  taxableValue: number;
  totalTax: number;
}

/**
 * What was bought from one supplier, with the GSTIN the credit is claimed against.
 *
 * A supplier with no GSTIN cannot pass on input credit, which is why the field is on the
 * row rather than left to a lookup: the report has to be able to say so.
 */
export interface PurchaseGstSupplierRow {
  supplierId: UUID;
  supplierName: string;
  gstin: string | null;
  invoiceCount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  /** True when the supply crossed a state line, so the tax is IGST. */
  isInterState: boolean;
}

export interface PurchaseGstSummary {
  fromDate: ISODateString;
  toDate: ISODateString;
  invoiceCount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  invoiceValue: number;
  /** Tax on purchases from suppliers with no GSTIN — not claimable as credit. */
  ineligibleTax: number;
  byRate: PurchaseGstRateRow[];
  byHsn: PurchaseGstHsnRow[];
  bySupplier: PurchaseGstSupplierRow[];
}

/** One side of the period's tax, split the three ways a return reports it. */
export interface TaxLeg {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * What the period actually costs in tax: output tax on sales, less the input credit
 * purchases carry, leaving what is paid over.
 */
export interface TaxPosition {
  fromDate: ISODateString;
  toDate: ISODateString;
  /** Tax charged to customers on posted sales invoices. */
  output: TaxLeg;
  /** Tax paid to suppliers and claimable back. */
  input: TaxLeg;
  /** Tax paid to suppliers who gave no GSTIN, so it cannot be claimed. */
  ineligibleInput: number;
  /**
   * `output - input`, per head. Negative means more was paid on purchases than charged on
   * sales, and the balance carries forward as credit rather than being refunded.
   */
  net: TaxLeg;
  /** What is payable in cash: the net, with a negative head treated as zero. */
  payable: number;
  /** What carries forward: the part of the net that is negative. */
  creditCarriedForward: number;
}

// ---------------------------------------------------------------------
// Payables: money going out to suppliers
//
// The mirror of collections, with one addition. A customer settles with money only; a
// supplier account is also settled by debit notes, because goods sent back are credit
// with them. So a payment carries tenders (cash that left) and set-offs (credit that
// was used), and the two together are what it can allocate to bills.
// ---------------------------------------------------------------------

export interface SupplierPaymentTenderItem {
  id: UUID;
  mode: ReceiptMode;
  amount: number;
  referenceNo: string | null;
  /** Which account the money left. Posting writes it out of that account's book. */
  accountId: UUID | null;
  accountName: string | null;
  /** Free text, on payments raised before accounts existed. */
  bankName: string | null;
}

export interface SupplierPaymentAllocationItem {
  id: UUID;
  purchaseInvoiceId: UUID;
  invoiceNumber: string;
  /** The supplier's own bill number, which is what they will ask about. */
  supplierInvoiceNo: string;
  invoiceDate: ISODateString;
  invoiceTotal: number;
  amount: number;
}

export interface SupplierPaymentDebitNoteItem {
  id: UUID;
  purchaseReturnId: UUID;
  returnNumber: string;
  returnDate: ISODateString;
  returnTotal: number;
  amount: number;
}

export interface SupplierPaymentItem {
  id: UUID;
  paymentNumber: string;
  supplierId: UUID;
  supplierName: string;
  branchId: UUID;
  branchName: string;
  paymentDate: ISODateString;
  /** The tender used, or MIXED when it was paid several ways. */
  mode: ReceiptMode;
  status: ReceiptStatus;
  /** "Bank 50,000 + Cash 5,000", ready to show in a list. */
  modeSummary: string;
  /** Cash that actually left. */
  amount: number;
  /** Credit notes spent instead of cash. */
  adjustedAmount: number;
  /** What the payment is worth in total: cash plus credit. */
  settledAmount: number;
  allocatedAmount: number;
  /** Paid but not tied to a bill: an advance sitting with the supplier. */
  onAccountAmount: number;
  remarks: string | null;
  cancelReason: string | null;
  version: number;
  tenders?: SupplierPaymentTenderItem[];
  allocations?: SupplierPaymentAllocationItem[];
  debitNotes?: SupplierPaymentDebitNoteItem[];
}

export interface SupplierPaymentTenderInput {
  mode: ReceiptMode;
  amount: number;
  referenceNo?: string;
  /** Which of your accounts the money left. */
  accountId?: UUID | null;
  bankName?: string;
}

export interface SupplierPaymentAllocationInput {
  purchaseInvoiceId: UUID;
  amount: number;
}

export interface SupplierPaymentDebitNoteInput {
  purchaseReturnId: UUID;
  amount: number;
}

export interface CreateSupplierPaymentInput {
  supplierId: UUID;
  branchId: UUID;
  paymentDate?: ISODateString;
  /** One row per tender; may be empty when the payment is purely a debit-note set-off. */
  tenders: SupplierPaymentTenderInput[];
  /** Credit notes being spent on this payment. */
  debitNotes?: SupplierPaymentDebitNoteInput[];
  remarks?: string;
  /** Omit to settle the bills falling due soonest, automatically. */
  allocations?: SupplierPaymentAllocationInput[];
}

export interface UpdateSupplierPaymentInput extends Partial<CreateSupplierPaymentInput> {
  version: number;
}

/** A purchase invoice still owing money — what a payment can settle. */
export interface OpenBillItem {
  purchaseInvoiceId: UUID;
  invoiceNumber: string;
  supplierInvoiceNo: string;
  invoiceDate: ISODateString;
  dueDate: ISODateString | null;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  /** Days past the due date; zero when not yet due. */
  overdueDays: number;
}

/** A debit note with credit left on it — what a payment can spend. */
export interface OpenDebitNoteItem {
  purchaseReturnId: UUID;
  returnNumber: string;
  returnDate: ISODateString;
  grandTotal: number;
  adjustedAmount: number;
  balanceAmount: number;
}

/** What is owed to one supplier, shown before any money is entered. */
export interface SupplierDueSummary {
  supplierId: UUID;
  payableAmount: number;
  overdueAmount: number;
  billCount: number;
  /** Unspent credit sitting on debit notes, which reduces what has to be paid. */
  creditAvailable: number;
  /** Advances already paid and not yet tied to a bill. */
  advanceAmount: number;
}

export type SupplierLedgerEntryType = 'OPENING' | 'INVOICE' | 'RETURN' | 'PAYMENT';

/**
 * One line of a supplier statement.
 *
 * A supplier is a creditor, so the sign convention is the opposite of a customer's: a
 * bill you receive credits their account and money you pay debits it. `balance` is
 * positive when you owe them.
 */
export interface SupplierLedgerEntry {
  date: ISODateString;
  type: SupplierLedgerEntryType;
  reference: string;
  particulars: string;
  /** What reduces the debt: payments made and goods sent back. */
  debit: number;
  /** What increases it: bills received. */
  credit: number;
  /** Balance after this entry; positive means you owe the supplier. */
  balance: number;
}

export interface SupplierLedger {
  supplierId: UUID;
  supplierName: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: SupplierLedgerEntry[];
}

/** One supplier's position on the payables report. */
export interface PayableRow {
  supplierId: UUID;
  supplierName: string;
  phone: string | null;
  paymentTermDays: number;
  balanceAmount: number;
  /** Balance split by how long it has been outstanding, from the due date. */
  current: number;
  days30: number;
  days60: number;
  days90: number;
  older: number;
  oldestBillDate: ISODateString | null;
  /** Unspent debit notes, which will not be paid in cash. */
  creditAvailable: number;
}
