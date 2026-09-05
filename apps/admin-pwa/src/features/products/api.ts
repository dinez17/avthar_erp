import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkUpdateProductRatesInput,
  CreateProductInput,
  Paginated,
  PaginationQuery,
  ProductItem,
  UpdateProductInput,
} from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'products';

export interface ProductFilters {
  categoryId?: string;
  brandId?: string;
  seriesId?: string;
  sizeMm?: string;
}

export function useProducts(query: PaginationQuery, filters: ProductFilters) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.brandId) params.set('brandId', filters.brandId);
  if (filters.seriesId) params.set('seriesId', filters.seriesId);
  if (filters.sizeMm) params.set('sizeMm', filters.sizeMm);
  return useQuery({
    queryKey: [KEY, query, filters],
    queryFn: () => apiFetch<Paginated<ProductItem>>(`/products?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useProductSizes() {
  return useQuery({
    queryKey: [KEY, 'sizes'],
    queryFn: () => apiFetch<string[]>('/products/sizes'),
    staleTime: 60_000,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      apiFetch<ProductItem>('/products', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateProductInput & { id: string }) =>
      apiFetch<ProductItem>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useBulkUpdateRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkUpdateProductRatesInput) =>
      apiFetch<ProductItem[]>('/products/rates/bulk', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
