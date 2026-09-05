import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AcknowledgeOrderInput,
  Paginated,
  PortalMe,
  PurchaseOrderItem,
  RaiseSupplierPoInput,
  SupplierPortalBranch,
  SupplierPortalInvoice,
  SupplierPortalOrder,
  SupplierPortalOrderDetail,
  SupplierPortalPayment,
  SupplierPortalPoStockLine,
  SupplierPortalProduct,
  SupplierPortalSummary,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../lib/api-client';

const KEY = 'portal';
const LIST = '?page=1&pageSize=100';

export function usePortalMe() {
  return useQuery({
    queryKey: [KEY, 'me'],
    queryFn: () => apiFetch<PortalMe>('/portal/me'),
    staleTime: 5 * 60_000,
  });
}

export function useSupplierSummary(supplierId: string | null) {
  return useQuery({
    queryKey: [KEY, supplierId, 'summary'],
    queryFn: () => apiFetch<SupplierPortalSummary>(`/portal/supplier/${supplierId}/summary`),
    enabled: Boolean(supplierId),
  });
}

export function useSupplierOrders(supplierId: string | null) {
  return useQuery({
    queryKey: [KEY, supplierId, 'orders'],
    queryFn: () =>
      apiFetch<Paginated<SupplierPortalOrder>>(`/portal/supplier/${supplierId}/orders${LIST}`),
    enabled: Boolean(supplierId),
  });
}

export function useSupplierOrder(supplierId: string | null, orderId: string | null) {
  return useQuery({
    queryKey: [KEY, supplierId, 'order', orderId],
    queryFn: () =>
      apiFetch<SupplierPortalOrderDetail>(`/portal/supplier/${supplierId}/orders/${orderId}`),
    enabled: Boolean(supplierId) && Boolean(orderId),
  });
}

export function useAcknowledgeOrder(supplierId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...input }: AcknowledgeOrderInput & { orderId: string }) =>
      apiFetch<SupplierPortalOrder>(
        `/portal/supplier/${supplierId}/orders/${orderId}/acknowledge`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY, supplierId] }),
  });
}

export function useSupplierInvoices(supplierId: string | null) {
  return useQuery({
    queryKey: [KEY, supplierId, 'invoices'],
    queryFn: () =>
      apiFetch<Paginated<SupplierPortalInvoice>>(`/portal/supplier/${supplierId}/invoices${LIST}`),
    enabled: Boolean(supplierId),
  });
}

export function useSupplierPayments(supplierId: string | null) {
  return useQuery({
    queryKey: [KEY, supplierId, 'payments'],
    queryFn: () =>
      apiFetch<Paginated<SupplierPortalPayment>>(`/portal/supplier/${supplierId}/payments${LIST}`),
    enabled: Boolean(supplierId),
  });
}

export function useSupplierProducts(supplierId: string | null) {
  return useQuery({
    queryKey: [KEY, supplierId, 'products'],
    queryFn: () => apiFetch<SupplierPortalProduct[]>(`/portal/supplier/${supplierId}/products`),
    enabled: Boolean(supplierId),
  });
}

export function useProductPoStock(supplierId: string | null, productId: string | null) {
  return useQuery({
    queryKey: [KEY, supplierId, 'po-stock', productId],
    queryFn: () =>
      apiFetch<SupplierPortalPoStockLine[]>(
        `/portal/supplier/${supplierId}/products/${productId}/po-stock`,
      ),
    enabled: Boolean(supplierId) && Boolean(productId),
  });
}

export function useSupplierBranches(supplierId: string | null) {
  return useQuery({
    queryKey: [KEY, supplierId, 'branches'],
    queryFn: () => apiFetch<SupplierPortalBranch[]>(`/portal/supplier/${supplierId}/branches`),
    enabled: Boolean(supplierId),
    staleTime: 5 * 60_000,
  });
}

export function useRaiseSupplierPo(supplierId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RaiseSupplierPoInput) =>
      apiFetch<PurchaseOrderItem>(`/portal/supplier/${supplierId}/orders`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY, supplierId] }),
  });
}

export const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
