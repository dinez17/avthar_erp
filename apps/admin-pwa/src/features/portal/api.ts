import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePortalAccountInput,
  Paginated,
  PaginationQuery,
  PartyItem,
  PortalAccountCreated,
  PortalAccountItem,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'portal-accounts';

export function usePortalAccounts(query: PaginationQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set('search', query.search);
  return useQuery({
    queryKey: [KEY, query],
    queryFn: () => apiFetch<Paginated<PortalAccountItem>>(`/portal-accounts?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

/** Active suppliers for the account picker. */
export function useSupplierOptions() {
  return useQuery({
    queryKey: ['/suppliers', 'options'],
    queryFn: () => apiFetch<Paginated<PartyItem>>('/suppliers?page=1&pageSize=200'),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useCreatePortalAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePortalAccountInput) =>
      apiFetch<PortalAccountCreated>('/portal-accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useSetPortalAccountActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<PortalAccountItem>(`/portal-accounts/${id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeletePortalAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/portal-accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
