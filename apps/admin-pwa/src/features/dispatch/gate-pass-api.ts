import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CloseTripInput,
  CreateGatePassInput,
  DeliverGatePassInput,
  GateOutInput,
  GatePassItem,
  GatePassPrintData,
  GatePassStatus,
  GatePassType,
  Paginated,
  PaginationQuery,
  PendingDispatchInvoice,
  UpdateGatePassInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'gate-passes';

export interface GatePassFilters {
  branchId?: string;
  customerId?: string;
  type?: GatePassType;
  status?: GatePassStatus;
  from?: string;
  to?: string;
}

export function useGatePasses(query: PaginationQuery, filters: GatePassFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<GatePassItem>>(`/gate-passes?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useGatePass(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<GatePassItem>(`/gate-passes/${id}`),
    enabled: Boolean(id),
  });
}

export function useGatePassPrint(id: string | null) {
  return useQuery({
    queryKey: [KEY, id, 'print'],
    queryFn: () => apiFetch<GatePassPrintData>(`/gate-passes/${id}/print`),
    enabled: Boolean(id),
  });
}

/** Posted invoices with goods still on the floor — what a new pass is built from. */
export function usePendingDispatch(branchId?: string, customerId?: string) {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (customerId) params.set('customerId', customerId);
  return useQuery({
    queryKey: [KEY, 'pending', branchId ?? null, customerId ?? null],
    queryFn: () =>
      apiFetch<PendingDispatchInvoice[]>(`/gate-passes/pending?${params.toString()}`),
  });
}

/** Gating a pass out changes what its invoices show as dispatched, so those caches go too. */
const dispatched = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: [KEY] });
  void queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
  void queryClient.invalidateQueries({ queryKey: ['stock'] });
};

export function useCreateGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGatePassInput) =>
      apiFetch<GatePassItem>('/gate-passes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => dispatched(queryClient),
  });
}

export function useUpdateGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateGatePassInput & { id: string }) =>
      apiFetch<GatePassItem>(`/gate-passes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => dispatched(queryClient),
  });
}

export function useSetGatePassLoaded() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, loaded }: { id: string; version: number; loaded: boolean }) =>
      apiFetch<GatePassItem>(`/gate-passes/${id}/loaded`, {
        method: 'PATCH',
        body: JSON.stringify({ version, loaded }),
      }),
    onSuccess: () => dispatched(queryClient),
  });
}

export function useGateOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: GateOutInput & { id: string }) =>
      apiFetch<GatePassItem>(`/gate-passes/${id}/gate-out`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => dispatched(queryClient),
  });
}

/** The vehicle is back: closing odometer, what each drop settled, cash counted in. */
export function useCloseTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CloseTripInput & { id: string }) =>
      apiFetch<GatePassItem>(`/gate-passes/${id}/close`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => dispatched(queryClient),
  });
}

export function useDeliverGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: DeliverGatePassInput & { id: string }) =>
      apiFetch<GatePassItem>(`/gate-passes/${id}/deliver`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => dispatched(queryClient),
  });
}

export function useReturnGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<GatePassItem>(`/gate-passes/${id}/return`, {
        method: 'PATCH',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => dispatched(queryClient),
  });
}

export function useCancelGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) =>
      apiFetch<GatePassItem>(`/gate-passes/${id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ version, reason }),
      }),
    onSuccess: () => dispatched(queryClient),
  });
}

export function useDeleteGatePass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/gate-passes/${id}`, { method: 'DELETE' }),
    onSuccess: () => dispatched(queryClient),
  });
}
