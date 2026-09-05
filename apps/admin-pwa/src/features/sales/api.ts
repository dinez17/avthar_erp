import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateQuotationInput,
  Paginated,
  PaginationQuery,
  PartyItem,
  AvailableStockItem,
  ProductPriceHint,
  SalesmanItem,
  QuotationItem,
  QuotationPrintData,
  QuotationStatus,
  UpdateQuotationInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';
import { fetchAllPages } from '../../lib/fetch-all-pages';

const KEY = 'quotations';

export interface QuotationFilters {
  customerId?: string;
  branchId?: string;
  status?: QuotationStatus;
}

export function useQuotations(query: PaginationQuery, filters: QuotationFilters) {
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
    queryFn: () => apiFetch<Paginated<QuotationItem>>(`/quotations?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useQuotation(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<QuotationItem>(`/quotations/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Free stock for the quoted products in the quoting branch: on hand less what confirmed
 * orders already hold. Quoting more than this is allowed, but the counter should know.
 */
export function useQuotationStock(branchId: string | undefined, productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: [KEY, 'stock-availability', branchId ?? null, ids],
    queryFn: () =>
      apiFetch<AvailableStockItem[]>(
        `/quotations/stock-availability?branchId=${branchId}&productIds=${ids.join(',')}`,
      ),
    enabled: Boolean(branchId) && ids.length > 0,
    staleTime: 30_000,
  });
}

/** Everything a printed copy needs: the quotation, the letterhead and the terms. */
export function useQuotationPrint(id: string | null) {
  return useQuery({
    queryKey: [KEY, id, 'print'],
    queryFn: () => apiFetch<QuotationPrintData>(`/quotations/${id}/print`),
    enabled: Boolean(id),
  });
}

/**
 * Every customer, for the picker on quotations, orders and invoices.
 *
 * Was a single 200-row page. Fine while the customer list was short, and silently wrong
 * the moment it was not — which sprint 12.5 guarantees, since it imports customers from
 * SixOrbit. A blank customer on an invoice is a great deal worse than a blank category.
 *
 * This is a correctness fix, not the final shape: a picker over thousands of customers
 * wants server-side search, and 12.5 should replace it with one.
 */
export function useCustomers() {
  return useQuery({
    queryKey: ['/customers', 'options'],
    queryFn: () => fetchAllPages<PartyItem>('/customers'),
    staleTime: 60_000,
  });
}

/** Active users holding a role flagged as a sales role. */
export function useSalesmen() {
  return useQuery({
    queryKey: ['/users/salesmen'],
    queryFn: () => apiFetch<SalesmanItem[]>('/users/salesmen'),
    staleTime: 5 * 60_000,
  });
}

/** Branch pricing guidance for the products currently on the quotation. */
export function usePriceHints(branchId: string | undefined, productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: [KEY, 'price-hints', branchId ?? null, ids],
    queryFn: () =>
      apiFetch<ProductPriceHint[]>(
        `/quotations/price-hints?branchId=${branchId}&productIds=${ids.join(',')}`,
      ),
    enabled: Boolean(branchId) && ids.length > 0,
    staleTime: 30_000,
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuotationInput) =>
      apiFetch<QuotationItem>('/quotations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateQuotationInput & { id: string }) =>
      apiFetch<QuotationItem>(`/quotations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useQuotationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      version,
      status,
    }: {
      id: string;
      version: number;
      status: 'SENT' | 'ACCEPTED' | 'REJECTED';
    }) =>
      apiFetch<QuotationItem>(`/quotations/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, version }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      // Accepting a walk-in quote registers them in the customer master, so the pickers
      // that read it are a customer out of date until they refetch.
      void queryClient.invalidateQueries({ queryKey: ['/customers'] });
    },
  });
}
