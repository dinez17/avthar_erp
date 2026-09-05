import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Paginated,
  SaveSixOrbitConfigInput,
  SixOrbitConfigItem,
  SixOrbitConnectionTest,
  SixOrbitPushResult,
  SixOrbitImportResult,
  SixOrbitImportStatus,
  SixOrbitImportStatusView,
  SixOrbitPruneResult,
  SixOrbitSyncHealth,
  SixOrbitSyncLogItem,
  SixOrbitSyncLogQuery,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'sixorbit-config';
const LOG_KEY = 'sixorbit-sync-log';

export function useSixOrbitConfig() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => apiFetch<SixOrbitConfigItem | null>('/sixorbit/config'),
  });
}

export function useSaveSixOrbitConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveSixOrbitConfigInput) =>
      apiFetch<SixOrbitConfigItem>('/sixorbit/config', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useTestSixOrbitConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<SixOrbitConnectionTest>('/sixorbit/test-connection', { method: 'POST' }),
    // A successful test stores a session, which moves `tokenFetchedAt`.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Only the parameters that are set are sent, so the URL says what is actually filtered. */
function toSearchParams(query: SixOrbitSyncLogQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  return params;
}

export function useSixOrbitSyncLog(query: SixOrbitSyncLogQuery) {
  return useQuery({
    queryKey: [LOG_KEY, query],
    queryFn: () =>
      apiFetch<Paginated<SixOrbitSyncLogItem>>(`/sixorbit/sync-log?${toSearchParams(query)}`),
    // Keeps the previous page on screen while the next loads, so filtering does not blink.
    placeholderData: (previous) => previous,
  });
}

export function useSixOrbitSyncHealth(windowHours: number) {
  return useQuery({
    queryKey: [LOG_KEY, 'health', windowHours],
    queryFn: () =>
      apiFetch<SixOrbitSyncHealth>(`/sixorbit/sync-log/health?windowHours=${windowHours}`),
    refetchInterval: 60_000,
  });
}

export function usePruneSixOrbitSyncLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (olderThanDays: number) =>
      apiFetch<SixOrbitPruneResult>(`/sixorbit/sync-log?olderThanDays=${olderThanDays}`, {
        method: 'DELETE',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LOG_KEY] }),
  });
}

// ---------------------------------------------------------------------
// Product import (12.2)
// ---------------------------------------------------------------------

const IMPORT_KEY = 'sixorbit-import';

export function useSixOrbitImportStatus(poll: boolean) {
  return useQuery({
    queryKey: [IMPORT_KEY, 'status'],
    queryFn: () => apiFetch<SixOrbitImportStatusView>('/sixorbit/products/import/status'),
    // Only while something is actually running — a finished import does not need a
    // request every two seconds for the rest of the day.
    refetchInterval: poll ? 2000 : false,
  });
}

export function useDrySixOrbitImport() {
  return useMutation({
    mutationFn: (since: string | null) =>
      apiFetch<SixOrbitImportResult>('/sixorbit/products/import', {
        method: 'POST',
        body: JSON.stringify({ dryRun: true, since: since ?? undefined }),
      }),
  });
}

export function useStartSixOrbitImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (since: string | null) =>
      apiFetch<SixOrbitImportStatus>('/sixorbit/products/import', {
        method: 'POST',
        body: JSON.stringify({ dryRun: false, since: since ?? undefined }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [IMPORT_KEY] }),
  });
}

export function useClearSixOrbitImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/sixorbit/products/import/status', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [IMPORT_KEY] }),
  });
}

/**
 * Push one product and get the answer.
 *
 * Runs on the API rather than the worker, so the response *is* the outcome — created,
 * edited, or blocked and why. By the time this resolves the row is already correct.
 */
export function usePushProductToSixOrbit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) =>
      apiFetch<SixOrbitPushResult>(`/sixorbit/products/${productId}/push`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/products'] }),
  });
}

/** Queue everything that has never reached SixOrbit, failed, or is blocked. */
export function usePushPendingProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ queued: number }>('/sixorbit/products/push-pending', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/products'] }),
  });
}
