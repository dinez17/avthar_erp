import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, PaginationQuery, UserListItem } from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'users';

const toQueryString = (q: PaginationQuery): string => {
  const params = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
  if (q.search) params.set('search', q.search);
  if (q.sortBy) {
    params.set('sortBy', q.sortBy);
    params.set('sortOrder', q.sortOrder ?? 'asc');
  }
  return params.toString();
};

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roleIds: string[];
  branchIds: string[];
  departmentIds: string[];
}

export interface UpdateUserInput extends Partial<Omit<CreateUserInput, 'email'>> {
  version: number;
}

export function useUsers(query: PaginationQuery) {
  return useQuery({
    queryKey: [KEY, query],
    queryFn: () => apiFetch<Paginated<UserListItem>>(`/users?${toQueryString(query)}`),
    placeholderData: (previous) => previous,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch<UserListItem>('/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: string }) =>
      apiFetch<UserListItem>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
