import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkSetStockInput,
  BulkSetStockResult,
  OrgNodeItem,
  Paginated,
  PaginationQuery,
  PostAdjustmentInput,
  PostOpeningStockInput,
  StockBalanceItem,
  StockCheckItem,
  StockMovementItem,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'stock';

export interface StockFilters {
  branchId?: string;
  godownId?: string;
  brandId?: string;
  categoryId?: string;
  batchNo?: string;
  shade?: string;
  /** Merge batch/shade rows into one line per product and godown. */
  groupByProduct?: string;
  productId?: string;
  fromDate?: string;
  toDate?: string;
}

const withFilters = (params: URLSearchParams, filters: StockFilters): URLSearchParams => {
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params;
};

export function useStockBalances(query: PaginationQuery, filters: StockFilters, enabled: boolean) {
  const params = withFilters(
    new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) }),
    filters,
  );
  if (query.search) params.set('search', query.search);
  return useQuery({
    queryKey: [KEY, 'balances', query, filters],
    queryFn: () => apiFetch<Paginated<StockBalanceItem>>(`/stock/balances?${params.toString()}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useStockCheck(query: PaginationQuery, branchId: string, enabled: boolean) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    branchId,
  });
  if (query.search) params.set('search', query.search);
  return useQuery({
    queryKey: [KEY, 'check', query, branchId],
    queryFn: () => apiFetch<Paginated<StockCheckItem>>(`/stock/check?${params.toString()}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useProductStockCheck(productId: string) {
  return useQuery({
    queryKey: [KEY, 'product-check', productId],
    queryFn: () => apiFetch<StockCheckItem[]>(`/stock/check/product/${productId}`),
    enabled: Boolean(productId),
  });
}

/** Count sheet: every product for a godown, including those with no stock yet. */
export function useCountSheet(
  branchId: string | undefined,
  godownId: string | undefined,
  query: PaginationQuery,
  filters: StockFilters,
  enabled: boolean,
) {
  const params = withFilters(
    new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) }),
    { ...filters, branchId, godownId },
  );
  if (query.search) params.set('search', query.search);
  return useQuery({
    queryKey: [KEY, 'count-sheet', branchId ?? null, godownId ?? null, query, filters],
    queryFn: () => apiFetch<Paginated<StockBalanceItem>>(`/stock/count-sheet?${params.toString()}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useStockMovements(
  query: PaginationQuery,
  filters: StockFilters & { type?: string },
  enabled: boolean,
) {
  const params = withFilters(
    new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) }),
    filters,
  );
  if (filters.type) params.set('type', filters.type);
  if (query.search) params.set('search', query.search);
  return useQuery({
    queryKey: [KEY, 'movements', query, filters],
    queryFn: () => apiFetch<Paginated<StockMovementItem>>(`/stock/movements?${params.toString()}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useGodowns(branchId?: string) {
  return useQuery({
    queryKey: ['/godowns', 'options', branchId ?? null],
    queryFn: () =>
      apiFetch<Paginated<OrgNodeItem>>(
        `/godowns?page=1&pageSize=200${branchId ? `&parentId=${branchId}` : ''}`,
      ),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function usePostOpeningStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PostOpeningStockInput) =>
      apiFetch<{ posted: number }>('/stock/opening', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePostAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PostAdjustmentInput) =>
      apiFetch<{ posted: number }>('/stock/adjustments', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useBulkSetStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkSetStockInput) =>
      apiFetch<BulkSetStockResult>('/stock/count', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export interface SmartStockCheckItem {
  productId: string;
  sku: string;
  productName: string;
  brandName: string;
  sizeMm: string | null;
  piecesPerBox: number;
  baseUom: string;
  bookQtyBoxes: number;
  lastCheckedAt: string | null;
  lastCountedQtyBoxes: number | null;
  lastDifferenceBoxes: number | null;
  lastMovementAt: string | null;
  due: boolean;
}

export interface SmartStockCheckResponse {
  items: SmartStockCheckItem[];
  totalProducts: number;
  dueProducts: number;
}

export function useSmartStockCheck(branchId: string, godownId: string, intervalMinutes: number, mode: string, search: string) {
  const params = new URLSearchParams({ branchId, godownId, intervalMinutes: String(intervalMinutes), mode });
  if (search.trim()) params.set('search', search.trim());
  return useQuery({
    queryKey: [KEY, 'smart-check', branchId, godownId, intervalMinutes, mode, search],
    queryFn: () => apiFetch<SmartStockCheckResponse>(`/stock/smart-check?${params.toString()}`),
    enabled: Boolean(branchId && godownId),
    refetchInterval: 30_000,
  });
}

export function useVerifySmartStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branchId: string; godownId: string; productId: string; boxes: number; pieces: number }) =>
      apiFetch<{ adjusted: boolean; differenceBoxes: number }>('/stock/smart-check', {
        method: 'POST', body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
