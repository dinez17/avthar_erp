import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api-client';

export interface ProductIncentiveItem { id: string; productId: string; validFrom: string; validTo: string; amountPerBox: number; product: { sku: string; name: string } }
export interface IncentiveReportRow { salesmanUserId: string | null; salesmanName: string; productId: string; sku: string; productName: string; boxes: number; incentiveAmount: number }
export interface IncentiveFilters { from: string; to: string; branchId?: string; salesmanUserId?: string; productId?: string }

export function useIncentives() {
  return useQuery({ queryKey: ['sales-incentives'], queryFn: () => apiFetch<ProductIncentiveItem[]>('/sales-incentives') });
}
export function useCreateIncentive() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: { productId: string; validFrom: string; validTo: string; amountPerBox: number }) => apiFetch<ProductIncentiveItem>('/sales-incentives', { method: 'POST', body: JSON.stringify(input) }), onSuccess: () => client.invalidateQueries({ queryKey: ['sales-incentives'] }) });
}
export function useBulkCreateIncentives() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (items: { productId: string; validFrom: string; validTo: string; amountPerBox: number }[]) => apiFetch<{ created: number }>('/sales-incentives/bulk', { method: 'POST', body: JSON.stringify({ items }) }), onSuccess: () => client.invalidateQueries({ queryKey: ['sales-incentives'] }) });
}
export function useIncentiveReport(filters: IncentiveFilters) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.salesmanUserId) params.set('salesmanUserId', filters.salesmanUserId);
  if (filters.productId) params.set('productId', filters.productId);
  return useQuery({ queryKey: ['sales-incentives', 'report', filters], queryFn: () => apiFetch<IncentiveReportRow[]>(`/sales-incentives/report?${params}`) });
}
