import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkCreateOrgNodesInput,
  CreateOrgNodeInput,
  OrgNodeItem,
  Paginated,
  PaginationQuery,
  UpdateOrgNodeInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

export type OrgEndpoint = '/companies' | '/branches' | '/godowns' | '/gates' | '/racks';

export function useOrgNodes(endpoint: OrgEndpoint, query: PaginationQuery, parentId?: string) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (parentId) params.set('parentId', parentId);
  return useQuery({
    queryKey: [endpoint, query, parentId ?? null],
    queryFn: () => apiFetch<Paginated<OrgNodeItem>>(`${endpoint}?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

/** Lightweight list used to populate parent <Select> options. */
export function useOrgOptions(endpoint: OrgEndpoint | null) {
  return useQuery({
    queryKey: [endpoint, 'options'],
    queryFn: () => apiFetch<Paginated<OrgNodeItem>>(`${endpoint}?page=1&pageSize=200`),
    enabled: endpoint !== null,
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

export function useCreateOrgNode(endpoint: OrgEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrgNodeInput) =>
      apiFetch<OrgNodeItem>(endpoint, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useUpdateOrgNode(endpoint: OrgEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateOrgNodeInput & { id: string }) =>
      apiFetch<OrgNodeItem>(`${endpoint}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useDeleteOrgNode(endpoint: OrgEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`${endpoint}/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useBulkCreateOrgNodes(endpoint: OrgEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkCreateOrgNodesInput) =>
      apiFetch<OrgNodeItem[]>(`${endpoint}/bulk`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}
