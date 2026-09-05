import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateHandoverInput,
  DriverCashHandoverItem,
  DriverDueSummary,
  Paginated,
  PaginationQuery,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'driver-cash';

export function useHandovers(query: PaginationQuery, branchId?: string, driverId?: string) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (branchId) params.set('branchId', branchId);
  if (driverId) params.set('driverId', driverId);
  return useQuery({
    queryKey: [KEY, 'handovers', query, branchId ?? null, driverId ?? null],
    queryFn: () =>
      apiFetch<Paginated<DriverCashHandoverItem>>(`/driver-cash/handovers?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

/** Every driver still carrying freight cash — the counter's worklist. */
export function useOutstandingDrivers(branchId?: string) {
  return useQuery({
    queryKey: [KEY, 'outstanding', branchId ?? null],
    queryFn: () =>
      apiFetch<DriverDueSummary[]>(
        `/driver-cash/outstanding${branchId ? `?branchId=${branchId}` : ''}`,
      ),
  });
}

/** One driver's unsettled trips, oldest first. */
export function useDriverDue(driverId: string | null, branchId?: string) {
  const params = new URLSearchParams();
  if (driverId) params.set('driverId', driverId);
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: [KEY, 'due', driverId, branchId ?? null],
    queryFn: () => apiFetch<DriverDueSummary>(`/driver-cash/due?${params.toString()}`),
    enabled: Boolean(driverId),
  });
}

/** Cash moving clears trips, so the gate passes and the reports both go stale. */
const settled = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: [KEY] });
  void queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
  void queryClient.invalidateQueries({ queryKey: ['dispatch-reports'] });
};

export function useCreateHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHandoverInput) =>
      apiFetch<DriverCashHandoverItem>('/driver-cash/handovers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => settled(queryClient),
  });
}

export function useDeleteHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/driver-cash/handovers/${id}`, { method: 'DELETE' }),
    onSuccess: () => settled(queryClient),
  });
}
