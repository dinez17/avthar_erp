import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSalesVisitInput,
  Paginated,
  PaginationQuery,
  SalesVisitItem,
  UpdateSalesVisitInput,
  VisitStatus,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'visits';

export interface VisitFilters {
  leadId?: string;
  salespersonUserId?: string;
  status?: VisitStatus;
  overdue?: boolean;
}

const toParams = (query: PaginationQuery, filters: VisitFilters): string => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (filters.leadId) params.set('leadId', filters.leadId);
  if (filters.salespersonUserId) params.set('salespersonUserId', filters.salespersonUserId);
  if (filters.status) params.set('status', filters.status);
  if (filters.overdue) params.set('overdue', 'true');
  return params.toString();
};

/** Visits against one lead, newest first. */
export function useLeadVisits(leadId: string | null) {
  return useQuery({
    queryKey: [KEY, { leadId }],
    queryFn: () =>
      apiFetch<Paginated<SalesVisitItem>>(
        `/visits?${toParams({ page: 1, pageSize: 100 }, { leadId: leadId ?? undefined })}`,
      ),
    enabled: Boolean(leadId),
  });
}

/** Visits across leads, for the planned-visits view. */
export function useVisits(query: PaginationQuery, filters: VisitFilters) {
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<SalesVisitItem>>(`/visits?${toParams(query, filters)}`),
    placeholderData: (previous) => previous,
  });
}

export function useCreateVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSalesVisitInput) =>
      apiFetch<SalesVisitItem>('/visits', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useUpdateVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSalesVisitInput & { id: string }) =>
      apiFetch<SalesVisitItem>(`/visits/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useDeleteVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/visits/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
