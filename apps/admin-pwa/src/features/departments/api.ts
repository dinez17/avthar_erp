import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DepartmentListItem, Paginated, PaginationQuery } from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'departments';

export interface CreateDepartmentInput {
  name: string;
  description?: string;
  isActive: boolean;
}

export interface UpdateDepartmentInput extends Partial<CreateDepartmentInput> {
  version: number;
}

export function useDepartments(query: PaginationQuery) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  return useQuery({
    queryKey: [KEY, query],
    queryFn: () => apiFetch<Paginated<DepartmentListItem>>(`/departments?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepartmentInput) =>
      apiFetch<DepartmentListItem>('/departments', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateDepartmentInput & { id: string }) =>
      apiFetch<DepartmentListItem>(`/departments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/departments/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
