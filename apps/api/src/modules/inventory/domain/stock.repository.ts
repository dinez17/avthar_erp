import type {
  MovementDirection,
  MovementType,
  Paginated,
  PaginationQuery,
  StockBalanceItem,
  StockMovementItem,
  UUID,
} from '@tiles-erp/shared-types';

export const STOCK_REPOSITORY = Symbol('STOCK_REPOSITORY');

/** A single posting request; the engine derives direction from the caller's intent. */
export interface MovementPosting {
  productId: UUID;
  branchId: UUID;
  godownId: UUID;
  gateId?: UUID | null;
  batchNo?: string | null;
  shade?: string | null;
  type: MovementType;
  direction: MovementDirection;
  /** Always positive. */
  qtyBoxes: number;
  refType?: string | null;
  refId?: UUID | null;
  refNumber?: string | null;
  reason?: string | null;
  remarks?: string | null;
  movementDate: Date;
  createdBy: UUID;
}

export interface StockBalanceFilter {
  branchId?: UUID;
  godownId?: UUID;
  productId?: UUID;
  brandId?: UUID;
  categoryId?: UUID;
  batchNo?: string;
  shade?: string;
  /** Hide rows that have netted to zero. */
  nonZeroOnly?: boolean;
  /** Merge batch/shade rows into one line per product and godown. */
  groupByProduct?: boolean;
}

export interface MovementFilter {
  branchId?: UUID;
  godownId?: UUID;
  productId?: UUID;
  type?: MovementType;
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Port for the inventory ledger. Implementations MUST write movements and update
 * balances inside a single transaction so the projection can never drift.
 */
export interface StockRepository {
  postMovements(postings: MovementPosting[]): Promise<number>;
  listBalances(
    query: PaginationQuery,
    filter: StockBalanceFilter,
  ): Promise<Paginated<StockBalanceItem>>;
  /**
   * Count sheet for one godown: every matching product appears, whether or not it
   * currently holds stock. Products with existing balances contribute one row per
   * batch/shade; products with none yield a single zero row.
   */
  listCountSheet(
    branchId: UUID,
    godownId: UUID,
    query: PaginationQuery,
    filter: StockBalanceFilter,
  ): Promise<Paginated<StockBalanceItem>>;
  listMovements(
    query: PaginationQuery,
    filter: MovementFilter,
  ): Promise<Paginated<StockMovementItem>>;
  /** Current quantity for one stock key, used to guard against negative stock. */
  currentQty(key: {
    productId: UUID;
    branchId: UUID;
    godownId: UUID;
    gateId?: UUID | null;
    batchNo?: string | null;
    shade?: string | null;
  }): Promise<number>;
  hasOpeningStock(branchId: UUID, productId: UUID, godownId: UUID): Promise<boolean>;
  /** Pieces-per-box for each product, used to fold loose pieces into box quantities. */
  productConversions(productIds: UUID[]): Promise<Map<UUID, { piecesPerBox: number; sku: string }>>;
  /** Current quantities for many stock keys at once, keyed by `productId|batch|shade`. */
  currentQtyMany(
    branchId: UUID,
    godownId: UUID,
    gateId: UUID | null,
    keys: { productId: UUID; batchNo?: string | null; shade?: string | null }[],
  ): Promise<Map<string, number>>;
}
