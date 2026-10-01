import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { Autocomplete, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { ColDef } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import type { ProductItem, ProfitRow, StockMovementItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { downloadTableExcel, downloadTablePdf, type ExportColumn } from '../../components/ListExportButtons';
import { useStockMovements } from '../inventory/api';
import { useProducts } from '../products/api';
import { useBranches } from '../products/branch-prices-api';
import { useProfitReport } from './profit-api';
import { useSalesmen } from './api';
import { useSessionBranchId } from '../../lib/session-branch';

type ReportKind = 'TRANSACTIONS' | 'FAST_MOVING' | 'PRODUCT_SALES' | 'SALESMAN';
const today = (): string => new Date().toISOString().slice(0, 10);
const monthStart = (): string => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); };
const money = (value: number): string => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const META: Record<ReportKind, { title: string; subtitle: string }> = {
  TRANSACTIONS: { title: 'Product-wise transaction report', subtitle: 'Complete inward and outward stock history for a selected product.' },
  FAST_MOVING: { title: 'Fast moving report', subtitle: 'Products ranked by sold quantity for the selected period.' },
  PRODUCT_SALES: { title: 'Product-wise sales report', subtitle: 'Posted product sales filtered by salesman, branch and period.' },
  SALESMAN: { title: 'Salesman-wise sales report', subtitle: 'Posted sales, cost and margin by salesman.' },
};

function SalesReportPage({ kind }: { kind: ReportKind }): JSX.Element {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useSessionBranchId();
  const [product, setProduct] = useState<ProductItem | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [salesmanUserId, setSalesmanUserId] = useState('');
  const pagination = usePagination({ initialPageSize: 50 });
  const branches = useBranches();
  const salesmen = useSalesmen(branchId || undefined);
  const products = useProducts({ page: 1, pageSize: 50, search: productSearch || undefined }, {});
  const productId = product?.id ?? '';
  const movements = useStockMovements(pagination.query, { branchId: branchId || undefined, productId: productId || undefined, fromDate: from, toDate: to }, kind === 'TRANSACTIONS' && Boolean(productId));
  const sales = useProfitReport({ grouping: kind === 'SALESMAN' ? 'SALESMAN' : 'PRODUCT', from, to, branchId: branchId || undefined, productId: productId || undefined, salesmanUserId: salesmanUserId || undefined });

  const movementColumns = useMemo<ColDef<StockMovementItem>[]>(() => [
    { field: 'movementDate', headerName: 'Date', valueFormatter: (p) => new Date(String(p.value)).toLocaleDateString('en-IN'), minWidth: 105 },
    { field: 'type', headerName: 'Transaction', minWidth: 130 }, { field: 'direction', headerName: 'In/Out', maxWidth: 85 },
    { field: 'qtyBoxes', headerName: 'Boxes', maxWidth: 100 }, { field: 'refNumber', headerName: 'Document', minWidth: 140 },
    { field: 'branchName', headerName: 'Branch', minWidth: 160 }, { field: 'godownName', headerName: 'Godown', minWidth: 150 },
    { field: 'batchNo', headerName: 'Batch', minWidth: 100 }, { field: 'shade', headerName: 'Shade', minWidth: 100 },
    { field: 'reason', headerName: 'Reason', minWidth: 170 },
  ], []);
  const salesColumns = useMemo<ColDef<ProfitRow>[]>(() => [
    { field: 'label', headerName: kind === 'SALESMAN' ? 'Salesman' : 'Product', minWidth: 240 },
    { field: 'subLabel', headerName: kind === 'SALESMAN' ? 'Details' : 'Brand', minWidth: 140 },
    ...(kind === 'PRODUCT_SALES'
      ? [
          { field: 'boxes' as const, headerName: 'Boxes', maxWidth: 105 },
          { field: 'pieces' as const, headerName: 'Pcs', maxWidth: 90 },
        ]
      : [{ field: 'qtyBoxes' as const, headerName: 'Boxes sold', maxWidth: 120 }]),
    { field: 'revenue', headerName: 'Sales ex GST', valueFormatter: (p) => money(Number(p.value)), minWidth: 140 },
    { field: 'cost', headerName: 'Cost', valueFormatter: (p) => money(Number(p.value)), minWidth: 130 },
    { field: 'margin', headerName: 'Margin', valueFormatter: (p) => money(Number(p.value)), minWidth: 130 },
    { field: 'marginPct', headerName: 'Margin %', valueFormatter: (p) => `${Number(p.value).toFixed(1)}%`, maxWidth: 110 },
  ], [kind]);
  const reportRows = useMemo(() => [...(sales.data?.rows ?? [])].sort((a, b) => kind === 'FAST_MOVING' ? b.qtyBoxes - a.qtyBoxes : b.revenue - a.revenue), [kind, sales.data]);

  type ExportRow = Record<string, string | number | null | undefined>;
  const exportRows: ExportRow[] = kind === 'TRANSACTIONS'
    ? (movements.data?.items ?? []).map((row) => ({ date: row.movementDate, sku: row.sku, product: row.productName, transaction: row.type, direction: row.direction, boxes: row.qtyBoxes, document: row.refNumber, branch: row.branchName, godown: row.godownName, batch: row.batchNo, shade: row.shade }))
    : reportRows.map((row) => ({ label: row.label, detail: row.subLabel, boxes: kind === 'PRODUCT_SALES' ? row.boxes : row.qtyBoxes, pieces: row.pieces, revenue: row.revenue, cost: row.cost, margin: row.margin, marginPct: row.marginPct }));
  const exportColumns: ExportColumn<ExportRow>[] = kind === 'TRANSACTIONS'
    ? ['Date', 'SKU', 'Product', 'Transaction', 'Direction', 'Boxes', 'Document', 'Branch', 'Godown', 'Batch', 'Shade'].map((header, index) => ({ header, value: (row) => row[['date', 'sku', 'product', 'transaction', 'direction', 'boxes', 'document', 'branch', 'godown', 'batch', 'shade'][index]!] }))
    : [{ header: kind === 'SALESMAN' ? 'Salesman' : 'Product', value: (row) => row.label }, { header: 'Details', value: (row) => row.detail }, { header: kind === 'PRODUCT_SALES' ? 'Boxes' : 'Boxes sold', value: (row) => row.boxes }, ...(kind === 'PRODUCT_SALES' ? [{ header: 'Pcs', value: (row: ExportRow) => row.pieces }] : []), { header: 'Sales ex GST', value: (row) => row.revenue }, { header: 'Cost', value: (row) => row.cost }, { header: 'Margin', value: (row) => row.margin }, { header: 'Margin %', value: (row) => row.marginPct }];
  const exportName = `${kind.toLowerCase()}-${from}-to-${to}`;

  return <PageContainer title={META[kind].title} subtitle={META[kind].subtitle} actions={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<DownloadIcon />} disabled={!exportRows.length} onClick={() => downloadTableExcel(`${exportName}.xls`, META[kind].title, exportColumns, exportRows)}>Excel</Button><Button variant="outlined" startIcon={<PictureAsPdfIcon />} disabled={!exportRows.length} onClick={() => downloadTablePdf(`${exportName}.pdf`, META[kind].title, exportColumns, exportRows)}>PDF</Button></Stack>}>
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
        <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 170 } }} />
        <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 170 } }} />
        <TextField select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} sx={{ width: { xs: '100%', sm: 240 } }}><MenuItem value="">All permitted branches</MenuItem>{(branches.data ?? []).map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}</TextField>
        {kind === 'PRODUCT_SALES' && <TextField select label="Salesman" value={salesmanUserId} onChange={(e) => setSalesmanUserId(e.target.value)} sx={{ width: { xs: '100%', sm: 240 } }}><MenuItem value="">All salesmen</MenuItem>{(salesmen.data ?? []).map((salesman) => <MenuItem key={salesman.id} value={salesman.id}>{salesman.name}</MenuItem>)}</TextField>}
        <Autocomplete options={products.data?.items ?? []} value={product} loading={products.isFetching} inputValue={productSearch} onInputChange={(_, value) => setProductSearch(value)} filterOptions={(options) => options} getOptionLabel={(p) => `${p.sku} · ${p.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, value) => setProduct(value)} sx={{ width: { xs: '100%', sm: 380 } }} renderInput={(params) => <TextField {...params} label={kind === 'TRANSACTIONS' ? 'Product *' : 'Product (optional)'} placeholder="Type SKU or product name" />} />
      </Stack></Paper>
      {kind === 'TRANSACTIONS' && !productId && <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}><Typography color="text.secondary">Search and select a product to view its transactions.</Typography></Paper>}
      {kind === 'TRANSACTIONS' && productId && <DataTable exportable={false} rows={movements.data?.items ?? []} columns={movementColumns} meta={movements.data?.meta} pagination={pagination} loading={movements.isFetching} searchPlaceholder="Search document, batch or shade…" height={600} />}
      {kind !== 'TRANSACTIONS' && <DataTable exportable={false} rows={reportRows} columns={salesColumns} loading={sales.isFetching} height={600} />}
      {kind !== 'TRANSACTIONS' && <Box sx={{ display: 'flex', gap: 3, justifyContent: 'flex-end', flexWrap: 'wrap' }}><Typography fontWeight={700}>Total boxes: {kind === 'PRODUCT_SALES' ? reportRows.reduce((sum, row) => sum + row.boxes, 0) : reportRows.reduce((sum, row) => sum + row.qtyBoxes, 0).toFixed(3)}</Typography>{kind === 'PRODUCT_SALES' && <Typography fontWeight={700}>Total pcs: {reportRows.reduce((sum, row) => sum + row.pieces, 0)}</Typography>}<Typography fontWeight={700}>Sales ex GST: {money(reportRows.reduce((sum, row) => sum + row.revenue, 0))}</Typography></Box>}
    </Stack>
  </PageContainer>;
}

export function ProductTransactionReportPage(): JSX.Element { return <SalesReportPage kind="TRANSACTIONS" />; }
export function FastMovingReportPage(): JSX.Element { return <SalesReportPage kind="FAST_MOVING" />; }
export function ProductSalesReportPage(): JSX.Element { return <SalesReportPage kind="PRODUCT_SALES" />; }
export function SalesmanSalesReportPage(): JSX.Element { return <SalesReportPage kind="SALESMAN" />; }
