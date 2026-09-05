import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CallLogItem,
  CreateCallLogInput,
  Paginated,
  PaginationQuery,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'calls';

export interface CallFilters {
  leadId?: string;
  callerUserId?: string;
  callbackDue?: boolean;
}

const toParams = (query: PaginationQuery, filters: CallFilters): string => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (filters.leadId) params.set('leadId', filters.leadId);
  if (filters.callerUserId) params.set('callerUserId', filters.callerUserId);
  if (filters.callbackDue) params.set('callbackDue', 'true');
  return params.toString();
};

/** Calls logged against one lead, newest first. */
export function useLeadCalls(leadId: string | null) {
  return useQuery({
    queryKey: [KEY, { leadId }],
    queryFn: () =>
      apiFetch<Paginated<CallLogItem>>(
        `/calls?${toParams({ page: 1, pageSize: 100 }, { leadId: leadId ?? undefined })}`,
      ),
    enabled: Boolean(leadId),
  });
}

export function useLogCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCallLogInput) =>
      apiFetch<CallLogItem>('/calls', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      // A call can move the lead's follow-up date and stage, so refresh the board too.
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useDeleteCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/calls/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
