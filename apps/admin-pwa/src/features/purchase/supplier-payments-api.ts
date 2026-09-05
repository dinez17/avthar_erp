import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSupplierPaymentInput,
  OpenBillItem,
  OpenDebitNoteItem,
  Paginated,
  PaginationQuery,
  PayableRow,
  ReceiptStatus,
  SupplierDueSummary,
  SupplierLedger,
  SupplierPaymentItem,
  UpdateSupplierPaymentInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'supplier-payments';

export interface SupplierPaymentFilters {
  supplierId?: string;
  branchId?: string;
  status?: ReceiptStatus;
}

export function useSupplierPayments(query: PaginationQuery, filters: SupplierPaymentFilters) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set('search', query.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () =>
      apiFetch<Paginated<SupplierPaymentItem>>(`/supplier-payments?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useSupplierPayment(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<SupplierPaymentItem>(`/supplier-payments/${id}`),
    enabled: Boolean(id),
  });
}

const scoped = (supplierId: string | null, branchId?: string): string => {
  const params = new URLSearchParams({ supplierId: supplierId ?? '' });
  if (branchId) params.set('branchId', branchId);
  return params.toString();
};

/** A supplier's unpaid bills, soonest due first — what this payment can settle. */
export function useOpenBills(supplierId: string | null, branchId?: string) {
  return useQuery({
    queryKey: [KEY, 'open-bills', supplierId, branchId ?? null],
    queryFn: () =>
      apiFetch<OpenBillItem[]>(`/supplier-payments/open-bills?${scoped(supplierId, branchId)}`),
    enabled: Boolean(supplierId),
  });
}

/** Debit notes with credit left — what can be spent instead of cash. */
export function useOpenDebitNotes(supplierId: string | null, branchId?: string) {
  return useQuery({
    queryKey: [KEY, 'open-debit-notes', supplierId, branchId ?? null],
    queryFn: () =>
      apiFetch<OpenDebitNoteItem[]>(
        `/supplier-payments/open-debit-notes?${scoped(supplierId, branchId)}`,
      ),
    enabled: Boolean(supplierId),
  });
}

/** What is owed to the supplier, before any money is entered. */
export function useSupplierDue(supplierId: string | null, branchId?: string) {
  return useQuery({
    queryKey: [KEY, 'due', supplierId, branchId ?? null],
    queryFn: () =>
      apiFetch<SupplierDueSummary>(`/supplier-payments/due?${scoped(supplierId, branchId)}`),
    enabled: Boolean(supplierId),
  });
}

export function useSupplierLedger(supplierId: string | null, from?: string, to?: string) {
  const params = new URLSearchParams({ supplierId: supplierId ?? '' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return useQuery({
    queryKey: [KEY, 'ledger', supplierId, from ?? null, to ?? null],
    queryFn: () => apiFetch<SupplierLedger>(`/supplier-payments/ledger?${params.toString()}`),
    enabled: Boolean(supplierId),
  });
}

export function usePayables(branchId?: string) {
  return useQuery({
    queryKey: [KEY, 'payables', branchId ?? null],
    queryFn: () =>
      apiFetch<PayableRow[]>(
        `/supplier-payments/payables${branchId ? `?branchId=${branchId}` : ''}`,
      ),
  });
}

/**
 * Settling a bill changes what it shows as due, and spending a debit note changes what
 * credit is left on it — so both of those caches go with the payment list.
 */
const settled = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: [KEY] });
  void queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
  void queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
};

export function useCreateSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierPaymentInput) =>
      apiFetch<SupplierPaymentItem>('/supplier-payments', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => settled(queryClient),
  });
}

export function useUpdateSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSupplierPaymentInput & { id: string }) =>
      apiFetch<SupplierPaymentItem>(`/supplier-payments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => settled(queryClient),
  });
}

export function usePostSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<SupplierPaymentItem>(`/supplier-payments/${id}/post`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => settled(queryClient),
  });
}

export function useCancelSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) =>
      apiFetch<SupplierPaymentItem>(`/supplier-payments/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ version, reason }),
      }),
    onSuccess: () => settled(queryClient),
  });
}

export function useDeleteSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/supplier-payments/${id}`, { method: 'DELETE' }),
    onSuccess: () => settled(queryClient),
  });
}
