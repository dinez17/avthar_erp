import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridOptions } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { Box, Stack, TablePagination, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useDebounce, type UsePaginationResult } from '@tiles-erp/hooks';
import type { PaginationMeta } from '@tiles-erp/shared-types';

export interface DataTableProps<T> {
  rows: T[];
  columns: ColDef<T>[];
  /** Omit both on a report that returns every row at once: no search box, no pager. */
  meta?: PaginationMeta | undefined;
  pagination?: UsePaginationResult;
  loading?: boolean;
  searchPlaceholder?: string;
  gridOptions?: GridOptions<T>;
  /** Grid body height in pixels. */
  height?: number;
}

/** Server-paginated AG Grid at compact density, with quick search. */
export function DataTable<T>({
  rows,
  columns,
  meta,
  pagination,
  loading = false,
  searchPlaceholder = 'Search…',
  gridOptions,
  height = 560,
}: DataTableProps<T>): JSX.Element {
  const theme = useTheme();
  const [searchInput, setSearchInput] = useState('');
  const debounced = useDebounce(searchInput, 350);

  const setSearch = pagination?.setSearch;
  useEffect(() => {
    setSearch?.(debounced);
  }, [debounced, setSearch]);

  const defaultColDef = useMemo<ColDef<T>>(
    () => ({ sortable: false, resizable: true, flex: 1, minWidth: 110 }),
    [],
  );

  return (
    <Stack spacing={0.75}>
      {pagination && (
        <TextField
          placeholder={searchPlaceholder}
          size="small"
          fullWidth={false}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ width: 300 }}
        />
      )}
      <Box
        className={theme.palette.mode === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'}
        sx={{
          width: '100%',
          height,
          // Compact density: tighter rows, smaller type, slimmer cell padding.
          '--ag-grid-size': '3px',
          '--ag-font-size': '12.5px',
          '--ag-cell-horizontal-padding': '8px',
          '--ag-row-height': '30px',
          '--ag-header-height': '32px',
          '--ag-list-item-height': '24px',
        }}
      >
        <AgGridReact<T>
          rowData={rows}
          columnDefs={columns}
          defaultColDef={defaultColDef}
          loading={loading}
          rowHeight={30}
          headerHeight={32}
          suppressCellFocus
          animateRows
          {...gridOptions}
        />
      </Box>
      {pagination && (
        <TablePagination
          component="div"
          count={meta?.totalItems ?? 0}
          page={(meta?.page ?? 1) - 1}
          rowsPerPage={meta?.pageSize ?? 25}
          rowsPerPageOptions={[25, 50, 100, 200]}
          onPageChange={(_, page) => pagination.setPage(page + 1)}
          onRowsPerPageChange={(e) => pagination.setPageSize(Number(e.target.value))}
          sx={{ '& .MuiTablePagination-toolbar': { minHeight: 40, pl: 1 } }}
        />
      )}
    </Stack>
  );
}
