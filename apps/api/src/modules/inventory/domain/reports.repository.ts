import type {
  LowStockItem,
  Paginated,
  PaginationQuery,
  StockAgeingItem,
  StockAgeingSummary,
  StockValuationItem,
  StockValuationSummary,
  UUID,
} from '@tiles-erp/shared-types';

export const STOCK_REPORTS_REPOSITORY = Symbol('STOCK_REPORTS_REPOSITORY');

export interface ReportFilter {
  branchId?: UUID;
  godownId?: UUID;
  brandId?: UUID;
  categoryId?: UUID;
  /** Merge batch/shade rows into one line per product and godown. */
  groupByProduct?: boolean;
}

/** Read-only reporting port over the stock projection. */
export interface StockReportsRepository {
  valuation(
    query: PaginationQuery,
    filter: ReportFilter,
  ): Promise<Paginated<StockValuationItem> & { summary: StockValuationSummary }>;
  ageing(
    query: PaginationQuery,
    filter: ReportFilter,
  ): Promise<Paginated<StockAgeingItem> & { summary: StockAgeingSummary }>;
  lowStock(query: PaginationQuery, filter: ReportFilter): Promise<Paginated<LowStockItem>>;
}
