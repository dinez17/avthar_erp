import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BranchPriceItem,
  BulkUpdateBranchPricesInput,
  OrgNodeItem,
  Paginated,
  PaginationQuery,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';
import type { ProductFilters } from './api';

const KEY = 'branch-prices';

export function useBranches() {
  return useQuery({
    queryKey: ['branches', 'options'],
    queryFn: () => apiFetch<Paginated<OrgNodeItem>>('/branches?page=1&pageSize=200'),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useBranchPrices(
  branchId: string | undefined,
  query: PaginationQuery,
  filters: ProductFilters,
) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    branchId: branchId ?? '',
  });
  if (query.search) params.set('search', query.search);
  if (filters.brandId) params.set('brandId', filters.brandId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.seriesId) params.set('seriesId', filters.seriesId);
  if (filters.sizeMm) params.set('sizeMm', filters.sizeMm);
  return useQuery({
    queryKey: [KEY, branchId ?? null, query, filters],
    queryFn: () => apiFetch<Paginated<BranchPriceItem>>(`/branch-prices?${params.toString()}`),
    enabled: Boolean(branchId),
    placeholderData: (previous) => previous,
  });
}

export function useBulkUpdateBranchPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkUpdateBranchPricesInput) =>
      apiFetch<BranchPriceItem[]>('/branch-prices/bulk', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
