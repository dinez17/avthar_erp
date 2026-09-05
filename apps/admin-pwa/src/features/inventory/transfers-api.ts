import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CancelTransferInput,
  CreateTransferInput,
  Paginated,
  PaginationQuery,
  ReceiveTransferInput,
  StockTransferItem,
  TransferPrintData,
  TransferStatus,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'stock-transfers';

export interface TransferFilters {
  branchId?: string;
  status?: TransferStatus;
}

export function useTransfers(query: PaginationQuery, filters: TransferFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.status) params.set('status', filters.status);
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<StockTransferItem>>(`/stock/transfers?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useTransfer(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => apiFetch<StockTransferItem>(`/stock/transfers/${id}`),
    enabled: Boolean(id),
  });
}

export function useTransferPrint(id: string | null) {
  return useQuery({
    queryKey: [KEY, id, 'print'],
    queryFn: () => apiFetch<TransferPrintData>(`/stock/transfers/${id}/print`),
    enabled: Boolean(id),
  });
}

/**
 * Every write moves stock, so the balances have to be dropped alongside the transfer
 * list — a dispatch takes stock out of one godown and a receipt puts it into another.
 */
function transferWritten(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: [KEY] });
  void queryClient.invalidateQueries({ queryKey: ['stock'] });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransferInput) =>
      apiFetch<StockTransferItem>('/stock/transfers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => transferWritten(queryClient),
  });
}

export function useReceiveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReceiveTransferInput }) =>
      apiFetch<StockTransferItem>(`/stock/transfers/${id}/receive`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => transferWritten(queryClient),
  });
}

export function useCancelTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CancelTransferInput }) =>
      apiFetch<StockTransferItem>(`/stock/transfers/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => transferWritten(queryClient),
  });
}
