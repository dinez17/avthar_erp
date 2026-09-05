import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePurchaseReturnInput,
  Paginated,
  PaginationQuery,
  PurchaseReturnItem,
  PurchaseReturnStatus,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'purchase-returns';

export interface ReturnFilters {
  supplierId?: string;
  branchId?: string;
  status?: PurchaseReturnStatus;
}

export function usePurchaseReturns(query: PaginationQuery, filters: ReturnFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<PurchaseReturnItem>>(`/purchase-returns?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseReturn(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<PurchaseReturnItem>(`/purchase-returns/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseReturnInput) =>
      apiFetch<PurchaseReturnItem>('/purchase-returns', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePostPurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<PurchaseReturnItem>(`/purchase-returns/${id}/post`, {
        method: 'PATCH',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      // Posting removes stock.
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}
