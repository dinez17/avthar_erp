import type {
  AvailableStockItem,
  OrderSplitPlan,
  Paginated,
  PaginationQuery,
  SalesOrderItem,
  SalesOrderStatus,
  StockReservationItem,
  UUID,
} from '@tiles-erp/shared-types';

export const SALES_ORDER_REPOSITORY = Symbol('SALES_ORDER_REPOSITORY');

export interface SalesOrderFilter {
  customerId?: UUID;
  branchId?: UUID;
  status?: SalesOrderStatus;
}

export interface ResolvedSalesOrderLine {
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

export interface SalesOrderWriteData {
  customerId: UUID;
  branchId: UUID;
  customerName: string;
  customerAddress: string | null;
  customerMobile: string | null;
  salesmanUserId: UUID | null;
  salesmanName: string | null;
  quotationId: UUID | null;
  orderDate: Date;
  deliveryDate: Date | null;
  remarks: string | null;
  /** Whether other branches may supply what this one cannot. */
  allowCrossBranch: boolean;
  subTotal: number;
  gstAmount: number;
  freightCharge: number;
  unloadingCharge: number;
  loadingCharge: number;
  roundOff: number;
  grandTotal: number;
  lines: ResolvedSalesOrderLine[];
}

/** A customer's credit position, checked before an order may be confirmed. */
export interface CustomerCredit {
  name: string;
  address: string | null;
  mobile: string | null;
  isActive: boolean;
  creditLimit: number;
  creditDays: number;
  /** Value already committed by other confirmed, uninvoiced orders. */
  committedValue: number;
  /** Owed on posted invoices that are not yet paid. */
  outstanding: number;
}

/** One allocation the confirm step intends to write. */
export interface PlannedReservation {
  salesOrderLineId: UUID;
  productId: UUID;
  /** Where the stock is. Not always the order's own branch — see `allowCrossBranch`. */
  branchId: UUID;
  godownId: UUID;
  gateId: UUID | null;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
}

/** Port for sales order persistence and the stock facts reservation depends on. */
export interface SalesOrderRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextOrderNumber(branchId?: UUID): Promise<string>;
  list(query: PaginationQuery, filter: SalesOrderFilter): Promise<Paginated<SalesOrderItem>>;
  findById(id: UUID): Promise<SalesOrderItem | null>;
  create(number: string, data: SalesOrderWriteData, createdBy: UUID): Promise<SalesOrderItem>;
  /** Replaces header and lines; only permitted while the order is a draft. */
  update(
    id: UUID,
    version: number,
    data: SalesOrderWriteData,
    updatedBy: UUID,
  ): Promise<SalesOrderItem>;
  /** Writes the reservations and moves the order to CONFIRMED in one transaction. */
  confirm(
    id: UUID,
    version: number,
    reservations: PlannedReservation[],
    confirmedBy: UUID,
    /** Frozen onto the order, because the reservations just written depend on it. */
    allowCrossBranch: boolean,
  ): Promise<SalesOrderItem>;
  /** Releases every active reservation and moves the order to CANCELLED. */
  cancel(id: UUID, version: number, reason: string, cancelledBy: UUID): Promise<SalesOrderItem>;
  /** Draft orders only; confirmed orders hold stock and must be cancelled instead. */
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;

  credit(customerId: UUID): Promise<CustomerCredit>;
  assertBranch(branchId: UUID): Promise<void>;
  salesmanName(userId: UUID): Promise<string | null>;
  isSalesman(userId: UUID): Promise<boolean>;

  /**
   * Free stock per godown for the given products, newest batches last.
   *
   * `branchIds` is a list because a cross-branch order may draw from more than its own
   * branch; pass one id for the ordinary case.
   */
  availableStock(branchIds: UUID[], productIds: UUID[]): Promise<AvailableStockItem[]>;
  /** Every active branch, so a cross-branch order knows where else to look. */
  sellableBranchIds(): Promise<UUID[]>;
  /** How a confirmed order breaks down by supplying branch — the split before it is cut. */
  splitPlan(salesOrderId: UUID): Promise<OrderSplitPlan>;
  reservations(salesOrderId: UUID): Promise<StockReservationItem[]>;
}
