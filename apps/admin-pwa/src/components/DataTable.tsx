import { AgGridReact } from 'ag-grid-react';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import type { ColDef, GridOptions, ICellRendererParams, ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { Box, Button, CircularProgress, Divider, Paper, Stack, TablePagination, TextField, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { createElement, useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react';
import { useDebounce, type UsePaginationResult } from '@tiles-erp/hooks';
import type { PaginationMeta } from '@tiles-erp/shared-types';
import { downloadTableExcel, downloadTablePdf, type ExportColumn } from './ListExportButtons';

export interface DataTableProps<T> {
  rows: T[];
  columns: ColDef<T>[];
  meta?: PaginationMeta | undefined;
  pagination?: UsePaginationResult;
  loading?: boolean;
  searchPlaceholder?: string;
  gridOptions?: GridOptions<T>;
  height?: number;
  mobileRowRenderer?: (row: T, rowIndex: number) => ReactNode;
  /** Disable only when a page already provides a richer, server-side export. */
  exportable?: boolean;
  exportTitle?: string;
  exportFilename?: string;
}

/** Server-paginated desktop grid that becomes touch-friendly record cards on phones. */
export function DataTable<T>({ rows, columns, meta, pagination, loading = false,
  searchPlaceholder = 'Search…', gridOptions, height = 560,
  mobileRowRenderer, exportable = true, exportTitle, exportFilename }: DataTableProps<T>): JSX.Element {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [searchInput, setSearchInput] = useState('');
  const debounced = useDebounce(searchInput, 350);
  const setSearch = pagination?.setSearch;

  useEffect(() => { setSearch?.(debounced); }, [debounced, setSearch]);

  const defaultColDef = useMemo<ColDef<T>>(
    () => ({ sortable: false, resizable: true, flex: 1, minWidth: 110 }), [],
  );
  const mobileColumns = useMemo(() => columns.filter((column) => !column.hide), [columns]);

  const resolvedExportTitle = exportTitle ?? window.location.pathname
    .split('/').filter(Boolean).pop()?.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    ?? 'ERP export';
  const resolvedExportFilename = exportFilename ?? resolvedExportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const valueFor = (row: T, column: ColDef<T>): unknown => {
    if (typeof column.valueGetter === 'function') {
      return column.valueGetter({ data: row, node: null, column: null, colDef: column,
        context: undefined, getValue: () => undefined } as unknown as ValueGetterParams<T, unknown>);
    }
    if (!column.field) return undefined;
    return String(column.field).split('.').reduce<unknown>((value, part) => {
      if (value === null || typeof value !== 'object') return undefined;
      return (value as Record<string, unknown>)[part];
    }, row);
  };

  const renderMobileCell = (row: T, column: ColDef<T>, rowIndex: number): ReactNode => {
    const value = valueFor(row, column);
    const params = { value, valueFormatted: null, data: row, node: null, rowIndex,
      colDef: column, column: null, context: undefined, getValue: () => value };
    if (column.cellRenderer && typeof column.cellRenderer === 'function') {
      return createElement(column.cellRenderer as ElementType,
        params as unknown as ICellRendererParams<T, unknown>);
    }
    if (typeof column.valueFormatter === 'function') {
      return column.valueFormatter(params as unknown as ValueFormatterParams<T, unknown>);
    }
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  const exportColumns = useMemo<ExportColumn<T>[]>(() => columns
    .filter((column) => !column.hide && Boolean(column.headerName))
    .map((column) => ({
      header: String(column.headerName),
      value: (row: T) => {
        const value = valueFor(row, column);
        if (typeof column.valueFormatter === 'function') {
          const formatted = column.valueFormatter(({
            value, valueFormatted: null, data: row, node: null, rowIndex: null,
            colDef: column, column: null, context: undefined, getValue: () => value,
          }) as unknown as ValueFormatterParams<T, unknown>);
          if (formatted !== null && formatted !== undefined) return String(formatted);
        }
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') return JSON.stringify(value);
        return value as string | number;
      },
    })), [columns]);

  return (
    <Stack spacing={0.75}>
      {(pagination || (exportable && exportColumns.length > 0)) && <Stack direction={{ xs: 'column', sm: 'row' }}
        spacing={1} alignItems={{ sm: 'center' }}>
        {pagination && <TextField placeholder={searchPlaceholder} size="small" value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)} sx={{ width: { xs: '100%', sm: 300 } }} />}
        {exportable && exportColumns.length > 0 && <Stack direction="row" spacing={1} sx={{ ml: { sm: 'auto' } }}>
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} disabled={rows.length === 0}
            onClick={() => downloadTableExcel(`${resolvedExportFilename}.xls`, resolvedExportTitle, exportColumns, rows)}>
            Excel
          </Button>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} disabled={rows.length === 0}
            onClick={() => downloadTablePdf(`${resolvedExportFilename}.pdf`, resolvedExportTitle, exportColumns, rows)}>
            PDF
          </Button>
        </Stack>}
      </Stack>}
      {mobile ? (
        <Stack spacing={1} aria-busy={loading}>
          {loading && <Stack direction="row" justifyContent="center" sx={{ py: 2 }}><CircularProgress size={28} /></Stack>}
          {!loading && rows.length === 0 && <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No records found.</Typography>
          </Paper>}
          {!loading && rows.map((row, rowIndex) => {
            if (mobileRowRenderer) {
              return <Box key={rowIndex}>{mobileRowRenderer(row, rowIndex)}</Box>;
            }
            const dataColumns = mobileColumns.filter((column) => Boolean(column.headerName));
            const actionColumns = mobileColumns.filter((column) => !column.headerName);
            return <Paper key={rowIndex} variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {dataColumns.map((column, columnIndex) => <Box
                  key={column.colId ?? String(column.field ?? column.headerName ?? columnIndex)}
                  sx={{ minWidth: 0, px: 1.5, py: 1.1, borderBottom: 1,
                    borderRight: columnIndex % 2 === 0 ? 1 : 0, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary" display="block">{column.headerName}</Typography>
                  <Box sx={{ mt: 0.25, fontSize: '0.875rem', overflowWrap: 'anywhere' }}>
                    {renderMobileCell(row, column, rowIndex)}
                  </Box>
                </Box>)}
              </Box>
              {actionColumns.length > 0 && <><Divider /><Stack direction="row" justifyContent="flex-end"
                flexWrap="wrap" sx={{ px: 0.75, py: 0.5, '& .MuiIconButton-root': { minWidth: 44, minHeight: 44 } }}>
                {actionColumns.map((column, columnIndex) => <Box key={column.colId ?? `action-${columnIndex}`}>
                  {renderMobileCell(row, column, rowIndex)}
                </Box>)}
              </Stack></>}
            </Paper>;
          })}
        </Stack>
      ) : (
        <Box className={theme.palette.mode === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'}
          sx={{ width: '100%', height, '--ag-grid-size': '3px', '--ag-font-size': '12.5px',
            '--ag-cell-horizontal-padding': '8px', '--ag-row-height': '30px', '--ag-header-height': '32px',
            '--ag-list-item-height': '24px' }}>
          <AgGridReact<T> rowData={rows} columnDefs={columns} defaultColDef={defaultColDef}
            loading={loading} rowHeight={30} headerHeight={32} suppressCellFocus animateRows {...gridOptions} />
        </Box>
      )}
      {pagination && <TablePagination component="div" count={meta?.totalItems ?? 0}
        page={(meta?.page ?? 1) - 1} rowsPerPage={meta?.pageSize ?? 25}
        rowsPerPageOptions={[25, 50, 100, 200]} onPageChange={(_, page) => pagination.setPage(page + 1)}
        onRowsPerPageChange={(event) => pagination.setPageSize(Number(event.target.value))}
        sx={{ '& .MuiTablePagination-toolbar': { minHeight: 40, pl: { xs: 0, sm: 1 },
          flexWrap: { xs: 'wrap', sm: 'nowrap' }, justifyContent: 'flex-end' } }} />}
    </Stack>
  );
}
