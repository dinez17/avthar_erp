import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { Autocomplete, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { ColDef } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import type { ProductItem } from '@tiles-erp/shared-types';
import { PageContainer } from '@tiles-erp/ui';
import { DataTable } from '../../components/DataTable';
import { downloadTableExcel, downloadTablePdf, type ExportColumn } from '../../components/ListExportButtons';
import { useProducts } from '../products/api';
import { useBranches } from '../products/branch-prices-api';
import { useSalesmen } from './api';
import { useIncentiveReport, type IncentiveReportRow } from './incentive-api';
import { useSessionBranchId } from '../../lib/session-branch';

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const money = (value: number): string => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthStart = (): string => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };

export function IncentiveReportPage(): JSX.Element {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => iso(new Date()));
  const [branchId, setBranchId] = useSessionBranchId();
  const [salesmanUserId, setSalesmanUserId] = useState('');
  const [product, setProduct] = useState<ProductItem | null>(null);
  const [search, setSearch] = useState('');
  const products = useProducts({ page: 1, pageSize: 50, search: search || undefined }, {});
  const branches = useBranches();
  const salesmen = useSalesmen(branchId || undefined);
  const report = useIncentiveReport({ from, to, branchId: branchId || undefined, salesmanUserId: salesmanUserId || undefined, productId: product?.id });
  const columns = useMemo<ColDef<IncentiveReportRow>[]>(() => [
    { field: 'salesmanName', headerName: 'Salesman', minWidth: 190 }, { field: 'sku', headerName: 'SKU', minWidth: 110 },
    { field: 'productName', headerName: 'Product', minWidth: 240 }, { field: 'boxes', headerName: 'Sold boxes', maxWidth: 130 },
    { field: 'incentiveAmount', headerName: 'Incentive', valueFormatter: (p) => money(Number(p.value)), minWidth: 140 },
  ], []);
  const exportColumns: ExportColumn<IncentiveReportRow>[] = [{ header: 'Salesman', value: (row) => row.salesmanName }, { header: 'SKU', value: (row) => row.sku }, { header: 'Product', value: (row) => row.productName }, { header: 'Sold boxes', value: (row) => row.boxes }, { header: 'Incentive', value: (row) => row.incentiveAmount }];
  const exportRows = report.data ?? [];
  const exportName = `salesman-incentive-${from}-to-${to}`;
  return <PageContainer title="Salesman incentive report" subtitle="Calculate dated product incentives from posted invoices." actions={<Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<DownloadIcon />} disabled={!exportRows.length} onClick={() => downloadTableExcel(`${exportName}.xls`, 'Salesman incentive report', exportColumns, exportRows)}>Excel</Button><Button variant="outlined" startIcon={<PictureAsPdfIcon />} disabled={!exportRows.length} onClick={() => downloadTablePdf(`${exportName}.pdf`, 'Salesman incentive report', exportColumns, exportRows)}>PDF</Button></Stack>}>
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h6" mb={1.5}>Report filters</Typography><Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField select label="Branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setSalesmanUserId(''); }} sx={{ minWidth: 220 }}><MenuItem value="">All permitted branches</MenuItem>{(branches.data ?? []).map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}</TextField>
        <TextField select label="Salesman" value={salesmanUserId} onChange={(e) => setSalesmanUserId(e.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">All salesmen</MenuItem>{(salesmen.data ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}</TextField>
        <Autocomplete options={products.data?.items ?? []} value={product} inputValue={search} onInputChange={(_, v) => setSearch(v)} onChange={(_, v) => setProduct(v)} filterOptions={(x) => x} getOptionLabel={(p) => `${p.sku} · ${p.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} sx={{ minWidth: 300 }} renderInput={(params) => <TextField {...params} label="Product (optional)" />} />
      </Stack></Paper>
      <DataTable exportable={false} rows={report.data ?? []} columns={columns} loading={report.isFetching} height={500} />
      <Typography textAlign="right" fontWeight={800}>Total incentive: ₹{money((report.data ?? []).reduce((sum, row) => sum + row.incentiveAmount, 0))}</Typography>
    </Stack>
  </PageContainer>;
}
