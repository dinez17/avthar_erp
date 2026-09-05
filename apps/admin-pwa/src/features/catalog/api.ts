import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CatalogItem,
  CreateCatalogInput,
  Paginated,
  PaginationQuery,
  PartyItem,
  UpdateCatalogInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';
import { fetchAllPages } from '../../lib/fetch-all-pages';

export type CatalogEndpoint = '/categories' | '/brands' | '/series' | '/collections';

export function useCatalogItems(
  endpoint: CatalogEndpoint,
  query: PaginationQuery,
  parentId?: string,
) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set('search', query.search);
  if (parentId) params.set('parentId', parentId);
  return useQuery({
    queryKey: [endpoint, query, parentId ?? null],
    queryFn: () => apiFetch<Paginated<CatalogItem>>(`${endpoint}?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

/** Every option, not the first page of them. See {@link fetchAllPages}. */
export function useCatalogOptions(endpoint: CatalogEndpoint | null) {
  return useQuery({
    queryKey: [endpoint, 'options'],
    queryFn: () => fetchAllPages<CatalogItem>(endpoint as CatalogEndpoint),
    enabled: endpoint !== null,
    staleTime: 60_000,
  });
}

/** Active suppliers, for assigning a supplier to a brand. */
export function useSupplierOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['/suppliers', 'options'],
    queryFn: () => fetchAllPages<PartyItem>('/suppliers'),
    enabled,
    staleTime: 60_000,
  });
}

export function useCreateCatalogItem(endpoint: CatalogEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCatalogInput) =>
      apiFetch<CatalogItem>(endpoint, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useUpdateCatalogItem(endpoint: CatalogEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCatalogInput & { id: string }) =>
      apiFetch<CatalogItem>(`${endpoint}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useDeleteCatalogItem(endpoint: CatalogEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`${endpoint}/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}
