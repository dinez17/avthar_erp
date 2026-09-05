import type { ISODateString, UUID } from './common';
import type { ProductUom } from './product';

/**
 * How much of an invoice has physically left, rolled up from its gate passes. It lives
 * with the invoice rather than with dispatch because it is a fact about the invoice.
 */
export type DispatchStatus = 'PENDING' | 'PARTIAL' | 'DISPATCHED';

export type QuotationStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED';

export interface QuotationLineItem {
  id: UUID;
  productId: UUID;
  sku: string;
  productName: string;
  sizeMm: string | null;
  piecesPerBox: number;
  baseUom: ProductUom;
  /** Quantity as entered at the counter. */
  boxes: number;
  pieces: number;
  /** Derived total in boxes, used for pricing and stock. */
  qtyBoxes: number;
  mrp: number | null;
  rate: number;
  discountPct: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
  /** Effective rate after discount, compared against the branch minimum. */
  netRate: number;
}

export interface QuotationItem {
  id: UUID;
  quotationNumber: string;
  /** Null for walk-in customers who are not in the master. */
  customerId: UUID | null;
  customerName: string;
  customerAddress: string | null;
  customerMobile: string | null;
  salesmanUserId: UUID | null;
  salesmanName: string | null;
  branchId: UUID;
  branchName: string;
  quotationDate: ISODateString;
  validUntil: ISODateString | null;
  status: QuotationStatus;
  subTotal: number;
  gstAmount: number;
  freightCharge: number;
  unloadingCharge: number;
  loadingCharge: number;
  roundOff: number;
  grandTotal: number;
  remarks: string | null;
  lineCount: number;
  /** Total boxes across all lines, shown as "Total item". */
  totalBoxes: number;
  /** True when validUntil has passed and the quotation is still open. */
  isExpired: boolean;
  version: number;
  lines?: QuotationLineItem[];
}

export interface QuotationLineInput {
  productId: UUID;
  /** Whole boxes; combined with pieces to derive the quantity. */
  boxes?: number;
  /** Loose pieces, converted using the product's pieces-per-box. */
  pieces?: number;
  /** Supplied directly when not entering box/pieces. */
  qtyBoxes?: number;
  mrp?: number;
  rate: number;
  discountPct?: number;
  gstRate?: number;
}

export interface CreateQuotationInput {
  /** Omit for a walk-in customer and supply the name instead. */
  customerId?: UUID | null;
  customerName?: string;
  customerAddress?: string;
  customerMobile?: string;
  salesmanUserId?: UUID | null;
  salesmanName?: string;
  branchId: UUID;
  quotationDate?: ISODateString;
  validUntil?: ISODateString;
  freightCharge?: number;
  unloadingCharge?: number;
  loadingCharge?: number;
  roundOff?: number;
  remarks?: string;
  lines: QuotationLineInput[];
}

export interface UpdateQuotationInput extends Partial<CreateQuotationInput> {
  version: number;
}

/** Pricing guidance for one product at a branch, used while quoting. */
export interface ProductPriceHint {
  productId: UUID;
  sku: string;
  productName: string;
  sizeMm: string | null;
  piecesPerBox: number;
  /** Products sold by the piece cannot take a box quantity. */
  baseUom: ProductUom;
  mrp: number | null;
  gstRate: number;
  landingCost: number | null;
  displayPrice: number | null;
  minSellingPrice: number | null;
  sellingPrice: number | null;
}

export type SalesOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_INVOICED'
  | 'INVOICED'
  | 'CANCELLED';

export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED';

export interface SalesOrderLineItem {
  id: UUID;
  productId: UUID;
  sku: string;
  productName: string;
  sizeMm: string | null;
  piecesPerBox: number;
  baseUom: ProductUom;
  boxes: number;
  pieces: number;
  qtyBoxes: number;
  mrp: number | null;
  rate: number;
  discountPct: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
  /** Raised as invoices are cut against the order. */
  invoicedQtyBoxes: number;
  /** Ordered less invoiced. */
  pendingQtyBoxes: number;
  /** Boxes currently reserved for this line. */
  reservedQtyBoxes: number;
}

export interface SalesOrderItem {
  id: UUID;
  orderNumber: string;
  quotationId: UUID | null;
  quotationNumber: string | null;
  customerId: UUID;
  customerName: string;
  customerAddress: string | null;
  customerMobile: string | null;
  salesmanUserId: UUID | null;
  salesmanName: string | null;
  branchId: UUID;
  branchName: string;
  orderDate: ISODateString;
  deliveryDate: ISODateString | null;
  status: SalesOrderStatus;
  /** Whether this order may draw stock from branches other than its own. */
  allowCrossBranch: boolean;
  /** More than one branch is reserved against it, so it will invoice as a split. */
  isSplit: boolean;
  /** Branches supplying this order, home branch first. Empty until it is confirmed. */
  supplyingBranchIds: UUID[];
  subTotal: number;
  gstAmount: number;
  freightCharge: number;
  unloadingCharge: number;
  loadingCharge: number;
  roundOff: number;
  grandTotal: number;
  remarks: string | null;
  cancelReason: string | null;
  lineCount: number;
  totalBoxes: number;
  version: number;
  lines?: SalesOrderLineItem[];
}

export interface SalesOrderLineInput {
  productId: UUID;
  boxes?: number;
  pieces?: number;
  qtyBoxes?: number;
  mrp?: number;
  rate: number;
  discountPct?: number;
  gstRate?: number;
}

export interface CreateSalesOrderInput {
  customerId: UUID;
  branchId: UUID;
  customerAddress?: string;
  customerMobile?: string;
  salesmanUserId?: UUID | null;
  orderDate?: ISODateString;
  deliveryDate?: ISODateString;
  freightCharge?: number;
  unloadingCharge?: number;
  loadingCharge?: number;
  roundOff?: number;
  remarks?: string;
  /**
   * Allow other branches to supply what this branch cannot.
   *
   * Off by default: it turns one order into several invoices under different GSTINs,
   * which should be a decision rather than a surprise.
   */
  allowCrossBranch?: boolean;
  lines: SalesOrderLineInput[];
}

export interface UpdateSalesOrderInput extends Partial<CreateSalesOrderInput> {
  version: number;
}

/** A single godown allocation made when an order is confirmed. */
export interface StockReservationItem {
  id: UUID;
  salesOrderLineId: UUID;
  productId: UUID;
  sku: string;
  productName: string;
  piecesPerBox: number;
  baseUom: ProductUom;
  /** The branch holding this stock — the one that will invoice it. */
  branchId: UUID;
  branchName: string;
  godownId: UUID;
  godownName: string;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  status: ReservationStatus;
}

/** Free stock for one stock key: on-hand less the reservations already held. */
export interface AvailableStockItem {
  productId: UUID;
  /** Where the stock sits. May differ from the order's branch on a cross-branch order. */
  branchId: UUID;
  branchName: string;
  godownId: UUID;
  godownName: string;
  batchNo: string | null;
  shade: string | null;
  onHandQtyBoxes: number;
  reservedQtyBoxes: number;
  availableQtyBoxes: number;
}

/** What one branch will supply on an order, and what it will be invoiced at. */
export interface BranchAllocationRow {
  branchId: UUID;
  branchName: string;
  /** True for the branch that took the order. */
  isHomeBranch: boolean;
  lineCount: number;
  qtyBoxes: number;
  /** Value of the goods this branch supplies, before tax. */
  subTotal: number;
  /** True when this branch is in a different state from the customer, so IGST applies. */
  interState: boolean;
  /** Set once an invoice has been raised for this branch on this order. */
  invoiceId: UUID | null;
  invoiceNumber: string | null;
}

/**
 * How a confirmed order breaks down by supplying branch.
 *
 * This is the invoice split before it is cut: one row per branch, and one invoice will
 * be raised per row.
 */
export interface OrderSplitPlan {
  salesOrderId: UUID;
  orderNumber: string;
  homeBranchId: UUID;
  allowCrossBranch: boolean;
  /** True when more than one branch supplies the order. */
  isSplit: boolean;
  rows: BranchAllocationRow[];
  /** Invoices already raised against this order, whether split or not. */
  invoicedQtyBoxes: number;
  pendingQtyBoxes: number;
}

export interface SplitInvoiceInput {
  salesOrderId: UUID;
  invoiceDate?: ISODateString;
  /** Limit the split to these branches; omit to raise one invoice for every branch. */
  branchIds?: UUID[];
}

export interface SplitInvoiceResult {
  salesOrderId: UUID;
  /** The drafts raised, one per supplying branch. */
  invoices: { invoiceId: UUID; invoiceNumber: string; branchId: UUID; branchName: string }[];
  /** Branches skipped because an invoice already covers them. */
  skipped: { branchId: UUID; branchName: string; reason: string }[];
}

/** Letterhead details for a printed document, taken from the branch and its company. */
export interface PrintPartyBlock {
  name: string;
  legalName: string | null;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  gstin: string | null;
}

/** Everything a quotation print needs in one call: document, letterhead and terms. */
export interface QuotationPrintData {
  quotation: QuotationItem;
  company: PrintPartyBlock;
  branch: PrintPartyBlock;
  /** Editable from Settings under `quotation.terms`; blank lines are dropped. */
  terms: string[];
}

export type SalesInvoiceStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export interface SalesInvoiceLineItem {
  id: UUID;
  productId: UUID;
  salesOrderLineId: UUID | null;
  sku: string;
  productName: string;
  sizeMm: string | null;
  piecesPerBox: number;
  baseUom: ProductUom;
  hsnCode: string | null;
  godownId: UUID;
  godownName: string;
  batchNo: string | null;
  shade: string | null;
  boxes: number;
  pieces: number;
  qtyBoxes: number;
  mrp: number | null;
  rate: number;
  discountPct: number;
  gstRate: number;
  lineSubTotal: number;
  lineCgst: number;
  lineSgst: number;
  lineIgst: number;
  lineGst: number;
  lineTotal: number;
}

export interface SalesInvoiceItem {
  id: UUID;
  invoiceNumber: string;
  salesOrderId: UUID | null;
  orderNumber: string | null;
  customerId: UUID;
  customerName: string;
  customerAddress: string | null;
  customerMobile: string | null;
  customerGstin: string | null;
  placeOfSupply: string | null;
  salesmanUserId: UUID | null;
  salesmanName: string | null;
  branchId: UUID;
  branchName: string;
  invoiceDate: ISODateString;
  dueDate: ISODateString | null;
  status: SalesInvoiceStatus;
  /** How much of the invoice has physically left, rolled up from its gate passes. */
  dispatchStatus: DispatchStatus;
  subTotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  freightCharge: number;
  unloadingCharge: number;
  loadingCharge: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  /** Grand total less what has been collected. */
  balanceAmount: number;
  remarks: string | null;
  cancelReason: string | null;
  lineCount: number;
  totalBoxes: number;
  /** True when the customer is in another state, so IGST applies. */
  isInterState: boolean;
  version: number;
  lines?: SalesInvoiceLineItem[];
}

export interface SalesInvoiceLineInput {
  productId: UUID;
  /** Present when drawing down a sales order line. */
  salesOrderLineId?: UUID;
  godownId: UUID;
  batchNo?: string | null;
  shade?: string | null;
  boxes?: number;
  pieces?: number;
  qtyBoxes?: number;
  mrp?: number;
  rate: number;
  discountPct?: number;
  gstRate?: number;
}

export interface CreateSalesInvoiceInput {
  customerId: UUID;
  branchId: UUID;
  salesOrderId?: UUID | null;
  customerAddress?: string;
  customerMobile?: string;
  invoiceDate?: ISODateString;
  dueDate?: ISODateString;
  freightCharge?: number;
  unloadingCharge?: number;
  loadingCharge?: number;
  roundOff?: number;
  remarks?: string;
  lines: SalesInvoiceLineInput[];
}

export interface UpdateSalesInvoiceInput extends Partial<CreateSalesInvoiceInput> {
  version: number;
}

/** What is still to be invoiced on an order, with the godowns holding it. */
export interface InvoiceableLine {
  salesOrderLineId: UUID;
  productId: UUID;
  sku: string;
  productName: string;
  sizeMm: string | null;
  piecesPerBox: number;
  baseUom: ProductUom;
  hsnCode: string | null;
  orderedQtyBoxes: number;
  invoicedQtyBoxes: number;
  /**
   * Already claimed by draft invoices that have not posted yet.
   *
   * A draft holds no stock, but it does hold a promise: letting a second draft claim the
   * same quantity means whichever posts second fails, having looked fine all along.
   */
  draftedQtyBoxes: number;
  /** Ordered, less what is invoiced and what drafts have already spoken for. */
  pendingQtyBoxes: number;
  rate: number;
  discountPct: number;
  gstRate: number;
  mrp: number | null;
  /** Reserved stock still available to draw down, oldest first. */
  sources: {
    /** The branch holding it — on a cross-branch order this decides which invoice. */
    branchId: UUID;
    branchName: string;
    godownId: UUID;
    godownName: string;
    batchNo: string | null;
    shade: string | null;
    qtyBoxes: number;
  }[];
}

/** Everything a tax invoice print needs in one call. */
export interface SalesInvoicePrintData {
  invoice: SalesInvoiceItem;
  company: PrintPartyBlock;
  branch: PrintPartyBlock;
  /** Editable from Settings under `invoice.terms`; blank lines are dropped. */
  terms: string[];
  /** Editable from Settings under `invoice.declaration`. */
  declaration: string | null;
}

export type ReceiptMode = 'CASH' | 'BANK' | 'UPI' | 'CHEQUE' | 'CARD' | 'MIXED';
export type ReceiptStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export interface ReceiptAllocationItem {
  id: UUID;
  salesInvoiceId: UUID;
  invoiceNumber: string;
  invoiceDate: ISODateString;
  invoiceTotal: number;
  amount: number;
}

export interface ReceiptPaymentItem {
  id: UUID;
  mode: ReceiptMode;
  amount: number;
  referenceNo: string | null;
  /** Where the money landed. Posting writes this amount into that account's book. */
  accountId: UUID | null;
  accountName: string | null;
  /** Free text, on receipts raised before accounts existed. */
  bankName: string | null;
}

export interface CustomerReceiptItem {
  id: UUID;
  receiptNumber: string;
  customerId: UUID;
  customerName: string;
  branchId: UUID;
  branchName: string;
  receiptDate: ISODateString;
  /** The tender used, or MIXED when the customer paid several ways. */
  mode: ReceiptMode;
  status: ReceiptStatus;
  /** "Cash 1,000 + UPI 5,000", ready to show in a list. */
  modeSummary: string;
  amount: number;
  allocatedAmount: number;
  /** Received but not tied to an invoice: sits as an advance on the customer's account. */
  onAccountAmount: number;
  remarks: string | null;
  cancelReason: string | null;
  version: number;
  payments?: ReceiptPaymentItem[];
  allocations?: ReceiptAllocationItem[];
}

export interface ReceiptAllocationInput {
  salesInvoiceId: UUID;
  amount: number;
}

export interface ReceiptPaymentInput {
  mode: ReceiptMode;
  amount: number;
  referenceNo?: string;
  /** Which of your accounts the money went into. */
  accountId?: UUID | null;
  bankName?: string;
}

export interface CreateReceiptInput {
  customerId: UUID;
  branchId: UUID;
  receiptDate?: ISODateString;
  /** One row per tender; the receipt total is their sum. */
  payments: ReceiptPaymentInput[];
  remarks?: string;
  /** Omit to settle the oldest open invoices automatically. */
  allocations?: ReceiptAllocationInput[];
}

export interface UpdateReceiptInput extends Partial<CreateReceiptInput> {
  version: number;
}

/** An invoice still owing money, oldest first, for allocation and for ageing. */
/** What a customer owes in total, shown before any money is entered. */
export interface CustomerDueSummary {
  customerId: UUID;
  outstandingAmount: number;
  overdueAmount: number;
  invoiceCount: number;
}

export interface OpenInvoiceItem {
  salesInvoiceId: UUID;
  invoiceNumber: string;
  invoiceDate: ISODateString;
  dueDate: ISODateString | null;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  /** Days past the due date; zero when not yet due. */
  overdueDays: number;
}

export type LedgerEntryType = 'OPENING' | 'INVOICE' | 'RECEIPT';

export interface LedgerEntry {
  date: ISODateString;
  type: LedgerEntryType;
  reference: string;
  particulars: string;
  /** What the customer owes us. */
  debit: number;
  /** What they have paid. */
  credit: number;
  /** Balance after this entry; positive means the customer owes us. */
  balance: number;
}

export interface CustomerLedger {
  customerId: UUID;
  customerName: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: LedgerEntry[];
}

/** One customer's position on the outstanding report. */
export interface OutstandingRow {
  customerId: UUID;
  customerName: string;
  phone: string | null;
  creditLimit: number;
  balanceAmount: number;
  /** Balance split by how long it has been outstanding. */
  current: number;
  days30: number;
  days60: number;
  days90: number;
  older: number;
  oldestInvoiceDate: ISODateString | null;
}

/** A single day on the sales trend. */
export interface DailySales {
  date: ISODateString;
  invoiceCount: number;
  salesValue: number;
}

/** What sold most over the window, by value. */
export interface TopProductRow {
  productId: UUID;
  sku: string;
  productName: string;
  qtyBoxes: number;
  piecesPerBox: number;
  baseUom: ProductUom;
  salesValue: number;
}

/** The numbers the counter and the owner look at first thing in the morning. */
export interface DashboardSummary {
  /** The window these figures cover. */
  fromDate: ISODateString;
  toDate: ISODateString;

  todaySalesValue: number;
  todayInvoiceCount: number;
  todayCollectedValue: number;

  periodSalesValue: number;
  periodInvoiceCount: number;
  periodCollectedValue: number;
  periodGstValue: number;
  periodPurchaseValue: number;

  /** Money owed by customers right now, and the overdue slice of it. */
  outstandingValue: number;
  overdueValue: number;

  /** Orders confirmed but not yet fully invoiced. */
  pendingOrderCount: number;
  pendingOrderValue: number;

  /** Stock at landing cost, and how many products are below their reorder level. */
  stockValue: number;
  lowStockCount: number;

  dailySales: DailySales[];
  topProducts: TopProductRow[];
}

/** Everything a printed money receipt needs in one call. */
export interface ReceiptPrintData {
  receipt: CustomerReceiptItem;
  company: PrintPartyBlock;
  branch: PrintPartyBlock;
  /** The customer's outstanding after every posted receipt, printed as their balance. */
  balanceAmount: number;
}

/** Outward supplies at one GST rate, split the way a return expects. */
export interface GstRateRow {
  gstRate: number;
  invoiceCount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

/** The HSN-wise table a GSTR-1 asks for. */
export interface GstHsnRow {
  hsnCode: string;
  productCount: number;
  qtyBoxes: number;
  taxableValue: number;
  totalTax: number;
}

/** Supplies split by where they went, which is what decides IGST versus CGST+SGST. */
export interface GstPlaceRow {
  placeOfSupply: string;
  isInterState: boolean;
  invoiceCount: number;
  taxableValue: number;
  totalTax: number;
}

export interface GstSummary {
  fromDate: ISODateString;
  toDate: ISODateString;
  invoiceCount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  invoiceValue: number;
  byRate: GstRateRow[];
  byHsn: GstHsnRow[];
  byPlace: GstPlaceRow[];
}

/**
 * GSTR-1 sections, named as the offline tool's sheets are. One row per invoice-and-rate
 * for the invoice-level tables; aggregated for B2CS and HSN.
 */
export interface Gstr1B2bRow {
  gstin: string;
  receiverName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  placeOfSupply: string;
  reverseCharge: 'Y' | 'N';
  invoiceType: string;
  rate: number;
  taxableValue: number;
  cessAmount: number;
}

export interface Gstr1B2clRow {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  placeOfSupply: string;
  rate: number;
  taxableValue: number;
  cessAmount: number;
}

export interface Gstr1B2csRow {
  type: 'OE';
  placeOfSupply: string;
  rate: number;
  taxableValue: number;
  cessAmount: number;
}

export interface Gstr1HsnRow {
  hsn: string;
  description: string;
  uqc: string;
  totalQuantity: number;
  totalValue: number;
  rate: number;
  taxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  cessAmount: number;
}

export interface Gstr1DocRow {
  natureOfDocument: string;
  serialFrom: string;
  serialTo: string;
  totalNumber: number;
  cancelled: number;
}

export interface Gstr1Return {
  fromDate: ISODateString;
  toDate: ISODateString;
  b2b: Gstr1B2bRow[];
  b2cl: Gstr1B2clRow[];
  b2cs: Gstr1B2csRow[];
  hsnB2b: Gstr1HsnRow[];
  hsnB2c: Gstr1HsnRow[];
  docs: Gstr1DocRow[];
}

// ---------------------------------------------------------------------
// Profit
// ---------------------------------------------------------------------

/** How a profit report is broken up. */
export type ProfitGrouping = 'INVOICE' | 'PRODUCT' | 'BRANCH' | 'SALESMAN';

export interface ProfitRow {
  /** The invoice, product, branch or salesman this line is about. */
  key: string;
  label: string;
  /** Secondary line: the customer for an invoice, the brand for a product. */
  subLabel: string | null;
  /** Goods value before GST. Freight and other charges are not margin and are excluded. */
  revenue: number;
  /** What those goods cost, from the figure frozen on each line at posting. */
  cost: number;
  margin: number;
  /** Margin as a percentage of revenue. Zero revenue reports zero rather than infinity. */
  marginPct: number;
  qtyBoxes: number;
  /**
   * Revenue on lines with no cost recorded — invoices posted before margin was tracked.
   *
   * Reported rather than hidden: margin on a line with no cost is not a small margin, it
   * is an unknown one, and averaging it in as zero cost would flatter every total.
   */
  revenueWithoutCost: number;
  /**
   * Revenue whose cost was estimated afterwards rather than captured at posting.
   *
   * Reported apart from the rest so an approximation can never read as a fact: it is
   * today's landing cost set against an older sale price.
   */
  revenueEstimatedCost: number;
}

export interface ProfitReport {
  from: ISODateString;
  to: ISODateString;
  grouping: ProfitGrouping;
  rows: ProfitRow[];
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  /** Total revenue across the report that has no cost behind it. */
  revenueWithoutCost: number;
  /** How many invoice lines that was, so the gap is a number rather than a feeling. */
  linesWithoutCost: number;
  /** Revenue across the report whose cost is an estimate. */
  revenueEstimatedCost: number;
  linesEstimated: number;
}
