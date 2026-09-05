import type {
  ProductPriceHint,
  InvoiceableLine,
  Paginated,
  PaginationQuery,
  SalesInvoiceItem,
  SalesInvoicePrintData,
  SalesInvoiceStatus,
  UUID,
} from '@tiles-erp/shared-types';

export const SALES_INVOICE_REPOSITORY = Symbol('SALES_INVOICE_REPOSITORY');

export interface SalesInvoiceFilter {
  customerId?: UUID;
  branchId?: UUID;
  salesOrderId?: UUID;
  status?: SalesInvoiceStatus;
}

export interface ResolvedSalesInvoiceLine {
  productId: UUID;
  salesOrderLineId: UUID | null;
  godownId: UUID;
  gateId: UUID | null;
  batchNo: string | null;
  shade: string | null;
  hsnCode: string | null;
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

export interface SalesInvoiceWriteData {
  customerId: UUID;
  branchId: UUID;
  salesOrderId: UUID | null;
  customerName: string;
  customerAddress: string | null;
  customerMobile: string | null;
  customerGstin: string | null;
  placeOfSupply: string | null;
  salesmanUserId: UUID | null;
  salesmanName: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  remarks: string | null;
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
  lines: ResolvedSalesInvoiceLine[];
}

/** The billing facts an invoice needs about its customer and the selling branch. */
export interface BillingParties {
  customerName: string;
  customerAddress: string | null;
  customerMobile: string | null;
  customerGstin: string | null;
  customerStateCode: string | null;
  customerIsActive: boolean;
  creditLimit: number;
  creditDays: number;
  /** Value of posted, unpaid invoices for this customer. */
  outstanding: number;
  branchStateCode: string | null;
}

/** Port for sales invoice persistence, posting and the order draw-down it depends on. */
export interface SalesInvoiceRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextInvoiceNumber(branchId?: UUID): Promise<string>;
  list(query: PaginationQuery, filter: SalesInvoiceFilter): Promise<Paginated<SalesInvoiceItem>>;
  findById(id: UUID): Promise<SalesInvoiceItem | null>;
  create(number: string, data: SalesInvoiceWriteData, createdBy: UUID): Promise<SalesInvoiceItem>;
  /** Replaces header and lines; drafts only. */
  update(
    id: UUID,
    version: number,
    data: SalesInvoiceWriteData,
    updatedBy: UUID,
  ): Promise<SalesInvoiceItem>;
  /**
   * Consumes the reservations, writes the SALE movements, reduces the balances and rolls
   * the order status forward — all in one transaction.
   */
  post(id: UUID, version: number, postedBy: UUID): Promise<SalesInvoiceItem>;
  /** Reverses a posted invoice: stock back in, order draw-down undone. */
  cancel(id: UUID, version: number, reason: string, cancelledBy: UUID): Promise<SalesInvoiceItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;

  /** The invoice plus the letterhead, terms and declaration a printed copy needs. */
  printData(id: UUID): Promise<SalesInvoicePrintData | null>;
  billingParties(customerId: UUID, branchId: UUID): Promise<BillingParties>;
  /**
   * Refuses lines shipping from a godown that belongs to a different branch.
   *
   * An invoice belongs to one branch; its stock has to come out of that branch's
   * godowns. Without this check the mismatch survives all the way to posting, which then
   * looks for a balance keyed on the invoice's branch, finds nothing, and blames the
   * godown for being empty while the stock sits there under its real branch.
   */
  assertGodownsInBranch(branchId: UUID, godownIds: UUID[]): Promise<void>;
  salesmanName(userId: UUID): Promise<string | null>;

  /**
   * Cost and the branch floor for the products on an invoice.
   *
   * Needed because an invoice can be raised without an order — a counter sale — and that
   * path enforced no price rule at all until now.
   */
  priceHints(branchId: UUID, productIds: UUID[]): Promise<Map<UUID, ProductPriceHint>>;
  /** What remains to be invoiced on a confirmed order, with its reserved sources. */
  /**
   * What the order still owes, counting drafts as well as posted invoices.
   *
   * `exceptInvoiceId` excludes a draft from its own figure, so editing one does not see
   * itself as a rival claim on the same goods.
   */
  invoiceableLines(salesOrderId: UUID, exceptInvoiceId?: UUID): Promise<InvoiceableLine[]>;
}
