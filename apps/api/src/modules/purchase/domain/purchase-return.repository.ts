import type {
  Paginated,
  PaginationQuery,
  PurchaseReturnItem,
  UUID,
} from '@tiles-erp/shared-types';

export const PURCHASE_RETURN_REPOSITORY = Symbol('PURCHASE_RETURN_REPOSITORY');

export interface ResolvedReturnLine {
  productId: UUID;
  batchNo: string | null;
  shade: string | null;
  qtyBoxes: number;
  rate: number;
  gstRate: number;
  lineSubTotal: number;
  lineGst: number;
  lineTotal: number;
}

export interface ReturnWriteData {
  returnNumber: string;
  supplierId: UUID;
  branchId: UUID;
  godownId: UUID;
  receiptId: UUID | null;
  returnDate: Date;
  reason: string;
  remarks: string | null;
  subTotal: number;
  gstAmount: number;
  grandTotal: number;
  createdBy: UUID;
  lines: ResolvedReturnLine[];
}

export interface ReturnFilter {
  supplierId?: UUID;
  branchId?: UUID;
  status?: 'DRAFT' | 'POSTED';
  fromDate?: Date;
  toDate?: Date;
}

/** Port for purchase returns; posting removes stock through the movement ledger. */
export interface PurchaseReturnRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextReturnNumber(branchId?: UUID): Promise<string>;
  create(data: ReturnWriteData): Promise<PurchaseReturnItem>;
  /** Marks the return posted and writes the stock OUT movements atomically. */
  post(id: UUID, version: number, actorId: UUID): Promise<PurchaseReturnItem>;
  list(query: PaginationQuery, filter: ReturnFilter): Promise<Paginated<PurchaseReturnItem>>;
  findById(id: UUID): Promise<PurchaseReturnItem | null>;
  assertEndpoints(supplierId: UUID, branchId: UUID, godownId: UUID): Promise<void>;
}
