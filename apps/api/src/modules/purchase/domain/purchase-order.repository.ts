import type {
  Paginated,
  PaginationQuery,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  UUID,
} from '@tiles-erp/shared-types';

export const PURCHASE_ORDER_REPOSITORY = Symbol('PURCHASE_ORDER_REPOSITORY');

export interface PurchaseOrderFilter {
  supplierId?: UUID;
  branchId?: UUID;
  status?: PurchaseOrderStatus;
  fromDate?: Date;
  toDate?: Date;
}

/** A line with its amounts already computed by the application layer. */
export interface ResolvedOrderLine {
  productId: UUID;
  qtyBoxes: number;
  rate: number;
  discountPct: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
}

export interface OrderWriteData {
  supplierId: UUID;
  branchId: UUID;
  orderDate: Date;
  expectedDate: Date | null;
  remarks: string | null;
  subTotal: number;
  gstAmount: number;
  grandTotal: number;
  lines: ResolvedOrderLine[];
}

/** Port for purchase-order persistence. */
export interface PurchaseOrderRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextPoNumber(branchId?: UUID): Promise<string>;
  list(query: PaginationQuery, filter: PurchaseOrderFilter): Promise<Paginated<PurchaseOrderItem>>;
  findById(id: UUID): Promise<PurchaseOrderItem | null>;
  create(poNumber: string, data: OrderWriteData, createdBy: UUID): Promise<PurchaseOrderItem>;
  /** Replaces header and lines; only permitted while the order is a draft. */
  update(
    id: UUID,
    version: number,
    data: OrderWriteData,
    updatedBy: UUID,
  ): Promise<PurchaseOrderItem>;
  setStatus(
    id: UUID,
    version: number,
    status: PurchaseOrderStatus,
    actorId: UUID,
  ): Promise<PurchaseOrderItem>;
  /** Validates the supplier and branch exist and are active. */
  assertReferences(supplierId: UUID, branchId: UUID): Promise<void>;
  /** GST rates for the given products, used when a line omits its own rate. */
  productGstRates(productIds: UUID[]): Promise<Map<UUID, { gstRate: number; sku: string }>>;
}
