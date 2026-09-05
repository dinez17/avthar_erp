import type {
  BranchPriceItem,
  BranchPriceUpdateEntry,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import type { ProductListFilter } from './products.repository';

export const BRANCH_PRICES_REPOSITORY = Symbol('BRANCH_PRICES_REPOSITORY');

/** Port for branch-specific selling prices. */
export interface BranchPricesRepository {
  /** Lists products with their prices for one branch; products without a price row yield nulls. */
  list(
    branchId: UUID,
    query: PaginationQuery,
    filter: ProductListFilter,
  ): Promise<Paginated<BranchPriceItem>>;
  bulkUpsert(
    branchId: UUID,
    items: BranchPriceUpdateEntry[],
    actorId: UUID,
  ): Promise<BranchPriceItem[]>;
}
