import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePartyInput,
  Paginated,
  PaginationQuery,
  PartyItem,
  UpdatePartyInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

export type PartyEndpoint = '/customers' | '/suppliers';

export function useParties(endpoint: PartyEndpoint, query: PaginationQuery, stateCode?: string) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (stateCode) params.set('stateCode', stateCode);
  return useQuery({
    queryKey: [endpoint, query, stateCode ?? null],
    queryFn: () => apiFetch<Paginated<PartyItem>>(`${endpoint}?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useNextPartyCode(endpoint: PartyEndpoint, enabled: boolean) {
  return useQuery({
    queryKey: [endpoint, 'next-code'],
    queryFn: () => apiFetch<string>(`${endpoint}/next-code`),
    enabled,
    staleTime: 0,
  });
}

export function useCreateParty(endpoint: PartyEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePartyInput) =>
      apiFetch<PartyItem>(endpoint, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useUpdateParty(endpoint: PartyEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePartyInput & { id: string }) =>
      apiFetch<PartyItem>(`${endpoint}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useDeleteParty(endpoint: PartyEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`${endpoint}/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}
