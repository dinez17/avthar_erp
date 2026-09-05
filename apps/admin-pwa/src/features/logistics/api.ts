import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DriverItem,
  Paginated,
  PaginationQuery,
  TransporterItem,
  VehicleItem,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

export type LogisticsEndpoint = '/transporters' | '/vehicles' | '/drivers';

/** Generic list hook; the row shape is supplied by the caller's config. */
export function useLogisticsList<T>(
  endpoint: LogisticsEndpoint,
  query: PaginationQuery,
  transporterId?: string,
) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (transporterId) params.set('transporterId', transporterId);
  return useQuery({
    queryKey: [endpoint, query, transporterId ?? null],
    queryFn: () => apiFetch<Paginated<T>>(`${endpoint}?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useTransporterOptions() {
  return useQuery({
    queryKey: ['/transporters', 'options'],
    queryFn: () => apiFetch<Paginated<TransporterItem>>('/transporters?page=1&pageSize=200'),
    staleTime: 60_000,
    select: (data) => data.items,
  });
}

/** Active vehicles for a picker; a gate pass chooses the lorry from the master. */
export function useVehicleOptions(transporterId?: string) {
  const params = new URLSearchParams({ page: '1', pageSize: '200' });
  if (transporterId) params.set('transporterId', transporterId);
  return useQuery({
    queryKey: ['/vehicles', 'options', transporterId ?? null],
    queryFn: () => apiFetch<Paginated<VehicleItem>>(`/vehicles?${params.toString()}`),
    staleTime: 60_000,
    select: (data) => data.items.filter((vehicle) => vehicle.isActive),
  });
}

/** Active drivers for a picker, optionally narrowed to one transporter's own. */
export function useDriverOptions(transporterId?: string) {
  const params = new URLSearchParams({ page: '1', pageSize: '200' });
  if (transporterId) params.set('transporterId', transporterId);
  return useQuery({
    queryKey: ['/drivers', 'options', transporterId ?? null],
    queryFn: () => apiFetch<Paginated<DriverItem>>(`/drivers?${params.toString()}`),
    staleTime: 60_000,
    select: (data) => data.items.filter((driver) => driver.isActive),
  });
}

export function useNextLogisticsCode(endpoint: LogisticsEndpoint, enabled: boolean) {
  return useQuery({
    queryKey: [endpoint, 'next-code'],
    queryFn: () => apiFetch<string>(`${endpoint}/next-code`),
    enabled,
    staleTime: 0,
  });
}

export function useCreateLogistics<T>(endpoint: LogisticsEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<T>(endpoint, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useUpdateLogistics<T>(endpoint: LogisticsEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Record<string, unknown> & { id: string }) =>
      apiFetch<T>(`${endpoint}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}

export function useDeleteLogistics(endpoint: LogisticsEndpoint) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`${endpoint}/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [endpoint] }),
  });
}
