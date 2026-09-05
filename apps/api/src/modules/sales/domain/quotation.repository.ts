import type {
  AvailableStockItem,
  Paginated,
  PaginationQuery,
  ProductPriceHint,
  QuotationItem,
  QuotationPrintData,
  QuotationStatus,
  UUID,
} from '@tiles-erp/shared-types';

export const QUOTATION_REPOSITORY = Symbol('QUOTATION_REPOSITORY');

export interface QuotationFilter {
  customerId?: UUID;
  branchId?: UUID;
  status?: QuotationStatus;
  fromDate?: Date;
  toDate?: Date;
}

export interface ResolvedQuotationLine {
  productId: UUID;
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
}

export interface QuotationWriteData {
  customerId: UUID | null;
  customerName: string;
  customerAddress: string | null;
  customerMobile: string | null;
  salesmanUserId: UUID | null;
  salesmanName: string | null;
  branchId: UUID;
  quotationDate: Date;
  validUntil: Date | null;
  remarks: string | null;
  subTotal: number;
  gstAmount: number;
  freightCharge: number;
  unloadingCharge: number;
  loadingCharge: number;
  roundOff: number;
  grandTotal: number;
  lines: ResolvedQuotationLine[];
}

/** Port for quotation persistence and the pricing data quoting depends on. */
export interface QuotationRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextQuotationNumber(branchId?: UUID): Promise<string>;
  list(query: PaginationQuery, filter: QuotationFilter): Promise<Paginated<QuotationItem>>;
  findById(id: UUID): Promise<QuotationItem | null>;
  create(number: string, data: QuotationWriteData, createdBy: UUID): Promise<QuotationItem>;
  /** Replaces header and lines; only permitted while the quotation is a draft. */
  update(
    id: UUID,
    version: number,
    data: QuotationWriteData,
    updatedBy: UUID,
  ): Promise<QuotationItem>;
  setStatus(
    id: UUID,
    version: number,
    status: QuotationStatus,
    actorId: UUID,
  ): Promise<QuotationItem>;
  assertReferences(customerId: UUID | null, branchId: UUID): Promise<void>;
  /** Free stock per godown, so a quote can warn before it promises what is not there. */
  availableStock(branchId: UUID, productIds: UUID[]): Promise<AvailableStockItem[]>;
  /** The quotation plus the letterhead and terms a printed copy needs. */
  printData(id: UUID): Promise<QuotationPrintData | null>;
  /** Name of a user, used to snapshot the credited salesperson. */
  salesmanName(userId: UUID): Promise<string | null>;
  /** True when the user holds a role flagged as a sales role. */
  isSalesman(userId: UUID): Promise<boolean>;
  /** Snapshot details for a customer master record. */
  customerSnapshot(
    customerId: UUID,
  ): Promise<{ name: string; address: string | null; mobile: string | null }>;
  /**
   * Gives a walk-in quotation a customer master record and links it.
   *
   * Matched on the phone number, because that is what a counter has: the same person
   * asking a second time should land on the same account, not a second one.
   */
  registerWalkIn(
    id: UUID,
    details: { name: string; phone: string; address: string | null },
    actorId: UUID,
  ): Promise<{ customerId: UUID; customerCode: string; created: boolean }>;
  /** Branch pricing and GST for the given products, used to validate and default rates. */
  priceHints(branchId: UUID, productIds: UUID[]): Promise<Map<UUID, ProductPriceHint>>;
}
