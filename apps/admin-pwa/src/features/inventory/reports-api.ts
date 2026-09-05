import { useQuery } from '@tanstack/react-query';
import type {
  LowStockItem,
  Paginated,
  PaginationQuery,
  StockAgeingItem,
  StockAgeingSummary,
  StockValuationItem,
  StockValuationSummary,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';
import type { StockFilters } from './api';

const KEY = 'stock-reports';

const buildParams = (query: PaginationQuery, filters: StockFilters): URLSearchParams => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (query.search) params.set('search', query.search);
  return params;
};

export function useValuationReport(query: PaginationQuery, filters: StockFilters, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'valuation', query, filters],
    queryFn: () =>
      apiFetch<Paginated<StockValuationItem> & { summary: StockValuationSummary }>(
        `/stock/reports/valuation?${buildParams(query, filters).toString()}`,
      ),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useAgeingReport(query: PaginationQuery, filters: StockFilters, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'ageing', query, filters],
    queryFn: () =>
      apiFetch<Paginated<StockAgeingItem> & { summary: StockAgeingSummary }>(
        `/stock/reports/ageing?${buildParams(query, filters).toString()}`,
      ),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useLowStockReport(query: PaginationQuery, filters: StockFilters, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'low-stock', query, filters],
    queryFn: () =>
      apiFetch<Paginated<LowStockItem>>(
        `/stock/reports/low-stock?${buildParams(query, filters).toString()}`,
      ),
    enabled,
    placeholderData: (previous) => previous,
  });
}
