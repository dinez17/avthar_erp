import { useQuery } from '@tanstack/react-query';
import type { AuditLogItem, Paginated, PaginationQuery } from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'audit';

export function useAuditLogs(query: PaginationQuery, entity?: string) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (entity) params.set('entity', entity);
  return useQuery({
    queryKey: [KEY, query, entity ?? null],
    queryFn: () => apiFetch<Paginated<AuditLogItem>>(`/audit?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useAuditEntities() {
  return useQuery({
    queryKey: [KEY, 'entities'],
    queryFn: () => apiFetch<string[]>('/audit/entities'),
    staleTime: 60_000,
  });
}
