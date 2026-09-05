import { useQuery } from '@tanstack/react-query';
import { endOfDayIso, startOfDayIso } from '@tiles-erp/shared';
import type { PurchaseGstSummary, TaxPosition } from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'purchase-gst';

/** The period both endpoints take. End of day, or today's invoices fall outside it. */
function periodParams(from: string, to: string, branchId: string): string {
  const params = new URLSearchParams({ from: startOfDayIso(from), to: endOfDayIso(to) });
  if (branchId) params.set('branchId', branchId);
  return params.toString();
}

export function usePurchaseGst(from: string, to: string, branchId: string) {
  const query = periodParams(from, to, branchId);
  return useQuery({
    queryKey: [KEY, 'summary', from, to, branchId || null],
    queryFn: () => apiFetch<PurchaseGstSummary>(`/purchase-gst/summary?${query}`),
  });
}

/** Output tax against input credit — the figure the period is actually judged on. */
export function useTaxPosition(from: string, to: string, branchId: string) {
  const query = periodParams(from, to, branchId);
  return useQuery({
    queryKey: [KEY, 'position', from, to, branchId || null],
    queryFn: () => apiFetch<TaxPosition>(`/purchase-gst/position?${query}`),
  });
}
