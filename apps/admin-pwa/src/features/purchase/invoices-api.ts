import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePurchaseInvoiceInput,
  UpdatePurchaseInvoiceInput,
  Paginated,
  PaginationQuery,
  PurchaseInvoiceItem,
  PurchaseInvoiceStatus,
  SupplierRateItem,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'purchase-invoices';

export interface InvoiceFilters {
  supplierId?: string;
  branchId?: string;
  status?: PurchaseInvoiceStatus;
}

export function usePurchaseInvoices(query: PaginationQuery, filters: InvoiceFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () =>
      apiFetch<Paginated<PurchaseInvoiceItem>>(`/purchase-invoices?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function usePurchaseInvoice(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<PurchaseInvoiceItem>(`/purchase-invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function useRateHistory(productId?: string, supplierId?: string, enabled = true) {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (productId) params.set('productId', productId);
  if (supplierId) params.set('supplierId', supplierId);
  return useQuery({
    queryKey: [KEY, 'rates', productId ?? null, supplierId ?? null],
    queryFn: () =>
      apiFetch<Paginated<SupplierRateItem>>(`/purchase-invoices/rate-history?${params.toString()}`),
    enabled,
  });
}

/**
 * Billing a receipt changes whether it can be billed again, so the goods-receipt cache
 * goes stale the moment an invoice is written. Without this the picker keeps offering a
 * receipt that has just been used, and the GRN list keeps calling it "To bill", until the
 * page is reloaded by hand.
 */
const invoiceWritten = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: [KEY] });
  void queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
};

export function useCreatePurchaseInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseInvoiceInput) =>
      apiFetch<PurchaseInvoiceItem>('/purchase-invoices', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invoiceWritten(queryClient),
  });
}

export function useUpdatePurchaseInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePurchaseInvoiceInput & { id: string }) =>
      apiFetch<PurchaseInvoiceItem>(`/purchase-invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    // An edit can move the invoice to a different receipt, freeing the old one.
    onSuccess: () => invoiceWritten(queryClient),
  });
}

export function usePostPurchaseInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<PurchaseInvoiceItem>(`/purchase-invoices/${id}/post`, {
        method: 'PATCH',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      invoiceWritten(queryClient);
      // Landing costs and purchase rates change when an invoice posts.
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-reports'] });
    },
  });
}
