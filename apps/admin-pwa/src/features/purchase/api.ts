import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateGoodsReceiptInput,
  CreatePurchaseOrderInput,
  GoodsReceiptItem,
  Paginated,
  PaginationQuery,
  PartyItem,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  UpdatePurchaseOrderInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'purchase-orders';

export interface PurchaseOrderFilters {
  supplierId?: string;
  branchId?: string;
  status?: PurchaseOrderStatus;
}

export function usePurchaseOrders(query: PaginationQuery, filters: PurchaseOrderFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<PurchaseOrderItem>>(`/purchase-orders?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<PurchaseOrderItem>(`/purchase-orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['/suppliers', 'options'],
    queryFn: () => apiFetch<Paginated<PartyItem>>('/suppliers?page=1&pageSize=200'),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) =>
      apiFetch<PurchaseOrderItem>('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePurchaseOrderInput & { id: string }) =>
      apiFetch<PurchaseOrderItem>(`/purchase-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePurchaseOrderStatus(action: 'approve' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<PurchaseOrderItem>(`/purchase-orders/${id}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// ---------------------------------------------------------------- receipts

const GRN_KEY = 'goods-receipts';

export function useGoodsReceipts(
  query: PaginationQuery,
  filters: PurchaseOrderFilters,
  /** The invoice picker asks for this: a receipt already billed has nothing left to bill. */
  uninvoiced = false,
) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (uninvoiced) params.set('uninvoiced', 'true');
  return useQuery({
    queryKey: [GRN_KEY, query, filters, uninvoiced],
    queryFn: () => apiFetch<Paginated<GoodsReceiptItem>>(`/goods-receipts?${params.toString()}`),
    placeholderData: (previous) => previous,
    // The invoice picker is a correctness list, not a dashboard: offering a receipt that
    // was billed thirty seconds ago wastes the entry and is refused on save. So it always
    // asks on open, rather than serving whatever the shared 30-second cache still holds.
    ...(uninvoiced ? { staleTime: 0, refetchOnMount: 'always' as const } : {}),
  });
}

export function useGoodsReceipt(id: string | null) {
  return useQuery({
    queryKey: [GRN_KEY, id],
    queryFn: () => apiFetch<GoodsReceiptItem>(`/goods-receipts/${id}`),
    enabled: Boolean(id),
  });
}

/** Approved and partially received orders are the ones goods can arrive against. */
export function useReceivableOrders(branchId?: string, supplierId?: string) {
  return useQuery({
    queryKey: ['purchase-orders', 'receivable', branchId ?? null, supplierId ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      if (branchId) params.set('branchId', branchId);
      if (supplierId) params.set('supplierId', supplierId);
      const [approved, partial] = await Promise.all([
        apiFetch<Paginated<PurchaseOrderItem>>(
          `/purchase-orders?${params.toString()}&status=APPROVED`,
        ),
        apiFetch<Paginated<PurchaseOrderItem>>(
          `/purchase-orders?${params.toString()}&status=PARTIALLY_RECEIVED`,
        ),
      ]);
      return [...approved.items, ...partial.items];
    },
    staleTime: 30_000,
  });
}

export function usePostGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoodsReceiptInput) =>
      apiFetch<GoodsReceiptItem>('/goods-receipts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [GRN_KEY] });
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}
