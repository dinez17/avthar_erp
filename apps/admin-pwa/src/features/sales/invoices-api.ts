import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSalesInvoiceInput,
  InvoiceableLine,
  Paginated,
  PaginationQuery,
  SalesInvoiceItem,
  SalesInvoicePrintData,
  SalesInvoiceStatus,
  UpdateSalesInvoiceInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'sales-invoices';

export interface SalesInvoiceFilters {
  customerId?: string;
  branchId?: string;
  salesOrderId?: string;
  status?: SalesInvoiceStatus;
}

export function useSalesInvoices(query: PaginationQuery, filters: SalesInvoiceFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<SalesInvoiceItem>>(`/sales-invoices?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useSalesInvoice(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<SalesInvoiceItem>(`/sales-invoices/${id}`),
    enabled: Boolean(id),
  });
}

/** Everything a printed tax invoice needs: the invoice, letterhead, terms, declaration. */
export function useSalesInvoicePrint(id: string | null) {
  return useQuery({
    queryKey: [KEY, id, 'print'],
    queryFn: () => apiFetch<SalesInvoicePrintData>(`/sales-invoices/${id}/print`),
    enabled: Boolean(id),
  });
}

/** Pending quantities on a confirmed order, with the godowns holding the reserved stock. */
export function useInvoiceableLines(salesOrderId: string | null) {
  return useQuery({
    queryKey: [KEY, 'invoiceable', salesOrderId],
    queryFn: () => apiFetch<InvoiceableLine[]>(`/sales-invoices/invoiceable/${salesOrderId}`),
    enabled: Boolean(salesOrderId),
  });
}

export function useCreateSalesInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesInvoiceInput) =>
      apiFetch<SalesInvoiceItem>('/sales-invoices', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    },
  });
}

export function useUpdateSalesInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSalesInvoiceInput & { id: string }) =>
      apiFetch<SalesInvoiceItem>(`/sales-invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePostSalesInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<SalesInvoiceItem>(`/sales-invoices/${id}/post`, {
        method: 'PATCH',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      // Posting takes stock out and moves the order forward.
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}

export function useCancelSalesInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) =>
      apiFetch<SalesInvoiceItem>(`/sales-invoices/${id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ version, reason }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}

export function useDeleteSalesInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/sales-invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
