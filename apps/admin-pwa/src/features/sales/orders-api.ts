import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AvailableStockItem,
  CreateSalesOrderInput,
  OrderSplitPlan,
  Paginated,
  PaginationQuery,
  SalesOrderItem,
  SalesOrderStatus,
  SplitInvoiceInput,
  SplitInvoiceResult,
  StockReservationItem,
  UpdateSalesOrderInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'sales-orders';

export interface SalesOrderFilters {
  customerId?: string;
  branchId?: string;
  status?: SalesOrderStatus;
}

export function useSalesOrders(query: PaginationQuery, filters: SalesOrderFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<SalesOrderItem>>(`/sales-orders?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useSalesOrder(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<SalesOrderItem>(`/sales-orders/${id}`),
    enabled: Boolean(id),
  });
}

/** Godown-level allocations held for a confirmed order. */
export function useReservations(id: string | null) {
  return useQuery({
    queryKey: [KEY, id, 'reservations'],
    queryFn: () => apiFetch<StockReservationItem[]>(`/sales-orders/${id}/reservations`),
    enabled: Boolean(id),
  });
}

/**
 * Free stock per godown for the products on the order.
 *
 * `crossBranch` widens the search to every branch, which is what an order allowing
 * cross-branch supply needs to see before it is confirmed.
 */
export function useAvailableStock(
  branchId: string | undefined,
  productIds: string[],
  crossBranch = false,
) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  const params = new URLSearchParams({ branchId: branchId ?? '', productIds: ids.join(',') });
  if (crossBranch) params.set('crossBranch', 'true');
  return useQuery({
    queryKey: [KEY, 'available-stock', branchId ?? null, ids, crossBranch],
    queryFn: () =>
      apiFetch<AvailableStockItem[]>(`/sales-orders/available-stock?${params.toString()}`),
    enabled: Boolean(branchId) && ids.length > 0,
  });
}

/** How a confirmed order breaks down by supplying branch — the split before it is cut. */
export function useSplitPlan(salesOrderId: string | null) {
  return useQuery({
    queryKey: [KEY, salesOrderId, 'split-plan'],
    queryFn: () => apiFetch<OrderSplitPlan>(`/sales-invoices/split-plan/${salesOrderId}`),
    enabled: Boolean(salesOrderId),
  });
}

/** Raises one draft invoice per supplying branch. */
export function useSplitInvoices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SplitInvoiceInput) =>
      apiFetch<SplitInvoiceResult>('/sales-invoices/split', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
    },
  });
}

export function useCreateSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesOrderInput) =>
      apiFetch<SalesOrderItem>('/sales-orders', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useConvertQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      quotationId,
      deliveryDate,
      customerId,
    }: {
      quotationId: string;
      deliveryDate?: string;
      /** Required when the quotation was raised for a walk-in customer. */
      customerId?: string;
    }) =>
      apiFetch<SalesOrderItem>(`/sales-orders/from-quotation/${quotationId}`, {
        method: 'POST',
        body: JSON.stringify({ deliveryDate, customerId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}

export function useUpdateSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSalesOrderInput & { id: string }) =>
      apiFetch<SalesOrderItem>(`/sales-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

/**
 * Confirming reserves the stock, so it is also where cross-branch supply is decided —
 * someone who has just hit a shortage can turn it on and retry.
 */
export function useConfirmSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      version,
      allowCrossBranch,
    }: {
      id: string;
      version: number;
      allowCrossBranch?: boolean;
    }) =>
      apiFetch<SalesOrderItem>(`/sales-orders/${id}/confirm`, {
        method: 'PATCH',
        body: JSON.stringify({ version, allowCrossBranch }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      // Reserving changes what other orders can promise.
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}

export function useCancelSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) =>
      apiFetch<SalesOrderItem>(`/sales-orders/${id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ version, reason }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}

export function useDeleteSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/sales-orders/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
