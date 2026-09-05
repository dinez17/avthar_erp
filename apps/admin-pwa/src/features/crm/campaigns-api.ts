import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CampaignItem,
  CampaignPerformanceRow,
  CreateCampaignInput,
  Paginated,
  UpdateCampaignInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'campaigns';

/** Campaigns for pickers (e.g. attributing a lead), active + recent. */
export function useCampaignOptions() {
  return useQuery({
    queryKey: [KEY, 'options'],
    queryFn: () => apiFetch<Paginated<CampaignItem>>('/campaigns?page=1&pageSize=200'),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

/** One campaign in full, for the edit form (carries the version and dates). */
export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<CampaignItem>(`/campaigns/${id}`),
    enabled: Boolean(id),
  });
}

/** The spend-to-return report, one row per campaign. */
export function useCampaignPerformance() {
  return useQuery({
    queryKey: [KEY, 'performance'],
    queryFn: () => apiFetch<CampaignPerformanceRow[]>('/campaigns/performance'),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      apiFetch<CampaignItem>('/campaigns', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCampaignInput & { id: string }) =>
      apiFetch<CampaignItem>(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      // Deleting a campaign nulls its leads' attribution.
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
