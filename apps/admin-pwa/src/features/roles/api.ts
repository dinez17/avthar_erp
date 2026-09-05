import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, PaginationQuery, RoleListItem } from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'roles';

export interface CreateRoleInput {
  name: string;
  description?: string;
  /** Users holding this role appear in salesman pickers. */
  isSalesRole?: boolean;
  permissionCodes: string[];
}

export interface UpdateRoleInput extends Partial<CreateRoleInput> {
  version: number;
}

export function useRoles(query: PaginationQuery) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  return useQuery({
    queryKey: [KEY, query],
    queryFn: () => apiFetch<Paginated<RoleListItem>>(`/roles?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function usePermissionCodes() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => apiFetch<string[]>('/roles/permissions'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) =>
      apiFetch<RoleListItem>('/roles', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateRoleInput & { id: string }) =>
      apiFetch<RoleListItem>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ success: boolean }>(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
