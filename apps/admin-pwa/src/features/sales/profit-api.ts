import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AreaAudit,
  ProfitGrouping,
  ProfitReport,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const PROFIT = 'profit';
const AUDIT = 'product-area-audit';

export interface ProfitFilters {
  grouping: ProfitGrouping;
  from: string;
  to: string;
  branchId?: string;
}

export function useProfitReport(filters: ProfitFilters) {
  const params = new URLSearchParams({
    grouping: filters.grouping,
    from: filters.from,
    to: filters.to,
  });
  if (filters.branchId) params.set('branchId', filters.branchId);
  return useQuery({
    queryKey: [PROFIT, filters],
    queryFn: () => apiFetch<ProfitReport>(`/profit?${params.toString()}`),
  });
}

/** Products whose recorded sq.ft per box disagrees with their own size. */
export function useAreaAudit() {
  return useQuery({
    queryKey: [AUDIT],
    queryFn: () => apiFetch<AreaAudit>('/products/area-audit'),
  });
}

export function useFixArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productIds?: string[]) =>
      apiFetch<{ fixed: number }>('/products/area-audit/fix', {
        method: 'POST',
        body: JSON.stringify({ productIds }),
      }),
    // Correcting an area moves stock valuation and every per-sq.ft figure with it, so
    // anything showing those numbers is refetched rather than left looking right.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [AUDIT] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: [PROFIT] });
    },
  });
}
