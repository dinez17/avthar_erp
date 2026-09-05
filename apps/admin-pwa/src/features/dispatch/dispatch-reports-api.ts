import { useQuery } from '@tanstack/react-query';
import { endOfDayIso, startOfDayIso } from '@tiles-erp/shared';
import type {
  DriverCashReport,
  FreightCollectionReport,
  PendingDispatchAgeReport,
  VehicleRunningReport,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'dispatch-reports';

/** The period every dispatch report takes, as a query string. */
function periodParams(from: string, to: string, branchId: string): string {
  // The To date must cover the whole day, or a trip made this morning falls outside a
  // report asked for "up to today".
  const params = new URLSearchParams({ from: startOfDayIso(from), to: endOfDayIso(to) });
  if (branchId) params.set('branchId', branchId);
  return params.toString();
}

/** `enabled` keeps the three unopened tabs from fetching until they are looked at. */
function useReport<T>(
  name: string,
  from: string,
  to: string,
  branchId: string,
  enabled: boolean,
) {
  const query = periodParams(from, to, branchId);
  return useQuery({
    queryKey: [KEY, name, from, to, branchId || null],
    queryFn: () => apiFetch<T>(`/dispatch-reports/${name}?${query}`),
    enabled,
  });
}

export const useFreightCollection = (
  from: string,
  to: string,
  branchId: string,
  enabled: boolean,
) => useReport<FreightCollectionReport>('freight-collection', from, to, branchId, enabled);

export const useVehicleRunning = (from: string, to: string, branchId: string, enabled: boolean) =>
  useReport<VehicleRunningReport>('vehicles', from, to, branchId, enabled);

export const useDriverCash = (from: string, to: string, branchId: string, enabled: boolean) =>
  useReport<DriverCashReport>('drivers', from, to, branchId, enabled);

/** The backlog is not period-bound: an invoice from six weeks ago is the point of it. */
export function usePendingAgeing(branchId: string, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'pending-ageing', branchId || null],
    queryFn: () =>
      apiFetch<PendingDispatchAgeReport>(
        `/dispatch-reports/pending-ageing${branchId ? `?branchId=${branchId}` : ''}`,
      ),
    enabled,
  });
}
