import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReceiptInput,
  CustomerDueSummary,
  CustomerLedger,
  CustomerReceiptItem,
  OpenInvoiceItem,
  OutstandingRow,
  Paginated,
  PaginationQuery,
  ReceiptPrintData,
  ReceiptStatus,
  UpdateReceiptInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'receipts';

export interface ReceiptFilters {
  customerId?: string;
  branchId?: string;
  status?: ReceiptStatus;
}

export function useReceipts(query: PaginationQuery, filters: ReceiptFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<CustomerReceiptItem>>(`/receipts?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useReceipt(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<CustomerReceiptItem>(`/receipts/${id}`),
    enabled: Boolean(id),
  });
}

/** Everything a printed money receipt needs: the receipt, letterhead and balance. */
export function useReceiptPrint(id: string | null) {
  return useQuery({
    queryKey: [KEY, id, 'print'],
    queryFn: () => apiFetch<ReceiptPrintData>(`/receipts/${id}/print`),
    enabled: Boolean(id),
  });
}

/** A customer's unpaid invoices, oldest first — what this receipt can settle. */
export function useOpenInvoices(customerId: string | null, branchId?: string) {
  const params = new URLSearchParams({ customerId: customerId ?? '' });
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [KEY, 'open-invoices', customerId, branchId ?? null],
    queryFn: () => apiFetch<OpenInvoiceItem[]>(`/receipts/open-invoices?${params.toString()}`),
    enabled: Boolean(customerId),
  });
}

/** What the customer owes in total, shown before any money is entered. */
export function useCustomerDue(customerId: string | null, branchId?: string) {
  const params = new URLSearchParams({ customerId: customerId ?? '' });
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [KEY, 'customer-due', customerId, branchId ?? null],
    queryFn: () => apiFetch<CustomerDueSummary>(`/receipts/customer-due?${params.toString()}`),
    enabled: Boolean(customerId),
  });
}

export function useCustomerLedger(customerId: string | null, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return useQuery({
    queryKey: [KEY, 'ledger', customerId, from ?? null, to ?? null],
    queryFn: () => apiFetch<CustomerLedger>(`/receivables/${customerId}/ledger?${params.toString()}`),
    enabled: Boolean(customerId),
  });
}

export function useOutstanding(branchId?: string) {
  return useQuery({
    queryKey: [KEY, 'outstanding', branchId ?? null],
    queryFn: () =>
      apiFetch<OutstandingRow[]>(
        `/receivables/outstanding${branchId ? `?branchId=${branchId}` : ''}`,
      ),
  });
}

/** Settling an invoice changes what it shows as due, so those caches go too. */
const settled = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: [KEY] });
  void queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
};

export function useCreateReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReceiptInput) =>
      apiFetch<CustomerReceiptItem>('/receipts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => settled(queryClient),
  });
}

export function useUpdateReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateReceiptInput & { id: string }) =>
      apiFetch<CustomerReceiptItem>(`/receipts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => settled(queryClient),
  });
}

export function usePostReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<CustomerReceiptItem>(`/receipts/${id}/post`, {
        method: 'PATCH',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => settled(queryClient),
  });
}

export function useCancelReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) =>
      apiFetch<CustomerReceiptItem>(`/receipts/${id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ version, reason }),
      }),
    onSuccess: () => settled(queryClient),
  });
}

export function useDeleteReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/receipts/${id}`, { method: 'DELETE' }),
    onSuccess: () => settled(queryClient),
  });
}
