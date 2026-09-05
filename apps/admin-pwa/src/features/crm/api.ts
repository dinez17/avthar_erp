import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeLeadStageInput,
  ConvertLeadInput,
  ConvertLeadResult,
  CreateLeadInput,
  LeadItem,
  LeadSource,
  LeadStage,
  LeadStageSummary,
  Paginated,
  PaginationQuery,
  UpdateLeadInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'leads';

export interface LeadFilters {
  stage?: LeadStage;
  source?: LeadSource;
  ownerUserId?: string;
  branchId?: string;
  campaignId?: string;
  followUpDue?: boolean;
}

const toParams = (query: PaginationQuery, filters: LeadFilters): string => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set('search', query.search);
  if (filters.stage) params.set('stage', filters.stage);
  if (filters.source) params.set('source', filters.source);
  if (filters.ownerUserId) params.set('ownerUserId', filters.ownerUserId);
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.campaignId) params.set('campaignId', filters.campaignId);
  if (filters.followUpDue) params.set('followUpDue', 'true');
  return params.toString();
};

export function useLeads(query: PaginationQuery, filters: LeadFilters) {
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<LeadItem>>(`/leads?${toParams(query, filters)}`),
    placeholderData: (previous) => previous,
  });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<LeadItem>(`/leads/${id}`),
    enabled: Boolean(id),
  });
}

/** Counts and weighted value per stage, for the board across the top of the page. */
export function useLeadPipeline(filters: LeadFilters) {
  const params = new URLSearchParams();
  if (filters.source) params.set('source', filters.source);
  if (filters.ownerUserId) params.set('ownerUserId', filters.ownerUserId);
  if (filters.branchId) params.set('branchId', filters.branchId);
  const qs = params.toString();
  return useQuery({
    queryKey: [KEY, 'pipeline', filters.source, filters.ownerUserId, filters.branchId],
    queryFn: () => apiFetch<LeadStageSummary[]>(`/leads/pipeline${qs ? `?${qs}` : ''}`),
    staleTime: 15_000,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) =>
      apiFetch<LeadItem>('/leads', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateLeadInput & { id: string }) =>
      apiFetch<LeadItem>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useChangeLeadStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ChangeLeadStageInput & { id: string }) =>
      apiFetch<LeadItem>(`/leads/${id}/stage`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ConvertLeadInput & { id: string }) =>
      apiFetch<ConvertLeadResult>(`/leads/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      // A new draft quotation now exists on the quotation desk.
      void queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/leads/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
