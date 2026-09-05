import type {
  GoodsReceiptItem,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';

export const GOODS_RECEIPT_REPOSITORY = Symbol('GOODS_RECEIPT_REPOSITORY');

export interface ResolvedReceiptLine {
  orderLineId: UUID | null;
  productId: UUID;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  rate: number;
}

export interface ReceiptWriteData {
  grnNumber: string;
  orderId: UUID | null;
  supplierId: UUID;
  branchId: UUID;
  godownId: UUID;
  receiptDate: Date;
  supplierInvoiceNo: string | null;
  remarks: string | null;
  createdBy: UUID;
  lines: ResolvedReceiptLine[];
}

export interface ReceiptFilter {
  /** Only receipts with no invoice standing against them. */
  uninvoiced?: boolean;
  supplierId?: UUID;
  branchId?: UUID;
  orderId?: UUID;
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Port for goods receipts. Implementations must write the receipt, post stock IN
 * movements, update order-line receipts and roll up the order status in one transaction.
 */
export interface GoodsReceiptRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextGrnNumber(branchId?: UUID): Promise<string>;
  post(data: ReceiptWriteData): Promise<GoodsReceiptItem>;
  list(query: PaginationQuery, filter: ReceiptFilter): Promise<Paginated<GoodsReceiptItem>>;
  findById(id: UUID): Promise<GoodsReceiptItem | null>;
  /** Validates supplier, branch and godown, and that the godown belongs to the branch. */
  assertEndpoints(supplierId: UUID, branchId: UUID, godownId: UUID): Promise<void>;
}
