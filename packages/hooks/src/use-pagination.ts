import { useCallback, useMemo, useState } from 'react';
import type { PaginationQuery } from '@tiles-erp/shared-types';

export interface UsePaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

export interface UsePaginationResult {
  query: PaginationQuery;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSearch: (search: string) => void;
  setSort: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  reset: () => void;
}

/** Controlled pagination/sort/search state suitable for AG Grid and TanStack Query. */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationResult {
  const { initialPage = 1, initialPageSize = 25 } = options;
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearchValue] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const setSearch = useCallback((value: string) => {
    setSearchValue(value || undefined);
    setPage(1);
  }, []);

  const setSort = useCallback((by: string, order: 'asc' | 'desc') => {
    setSortBy(by);
    setSortOrder(order);
  }, []);

  const reset = useCallback(() => {
    setPage(initialPage);
    setPageSize(initialPageSize);
    setSearchValue(undefined);
    setSortBy(undefined);
    setSortOrder('asc');
  }, [initialPage, initialPageSize]);

  const query = useMemo<PaginationQuery>(
    () => ({ page, pageSize, search, sortBy, sortOrder }),
    [page, pageSize, search, sortBy, sortOrder],
  );

  return { query, setPage, setPageSize, setSearch, setSort, reset };
}
