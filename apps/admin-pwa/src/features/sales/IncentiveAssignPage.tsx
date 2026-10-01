import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Button, Chip, Divider, Stack, TextField } from '@mui/material';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { ProductItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { ProductFilterBar } from '../products/ProductFilterBar';
import { useProducts, type ProductFilters } from '../products/api';
import { useBulkCreateIncentives } from './incentive-api';

type IncentiveRow = ProductItem & { amountPerBox: number };
const dateValue = (date: Date): string => date.toISOString().slice(0, 10);
const num = (value: unknown): number => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };

export function IncentiveAssignPage(): JSX.Element {
  const pagination = usePagination({ initialPageSize: 50 });
  const [filters, setFilters] = useState<ProductFilters>({});
  const products = useProducts(pagination.query, filters);
  const bulkCreate = useBulkCreateIncentives();
  const [validFrom, setValidFrom] = useState(() => dateValue(new Date()));
  const [validTo, setValidTo] = useState(() => dateValue(new Date()));
  const [bulkValue, setBulkValue] = useState('');
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const items = products.data?.items ?? [];
  const rows = useMemo<IncentiveRow[]>(() => items.map((item) => ({ ...item, amountPerBox: edits[item.id] ?? 0 })), [items, edits]);
  const columns = useMemo<ColDef<IncentiveRow>[]>(() => [
    { field: 'sku', headerName: 'SKU', minWidth: 150 }, { field: 'name', headerName: 'Product', minWidth: 240 },
    { field: 'brandName', headerName: 'Brand', minWidth: 140 }, { field: 'sizeMm', headerName: 'Size', minWidth: 110 },
    { field: 'amountPerBox', headerName: 'Incentive ₹ / box', editable: true, minWidth: 170, valueParser: (p) => num(p.newValue), cellStyle: { backgroundColor: 'rgba(11, 95, 255, 0.06)', fontWeight: 700 } },
  ], []);
  const changedCount = Object.values(edits).filter((value) => value > 0).length;
  const applyToVisible = (): void => {
    const value = num(bulkValue);
    if (value <= 0) { setError('Enter an incentive amount greater than zero'); return; }
    setError(null); setSavedCount(null);
    setEdits((previous) => ({ ...previous, ...Object.fromEntries(items.map((item) => [item.id, value])) }));
  };
  const save = async (): Promise<void> => {
    if (validTo < validFrom) { setError('End date must be on or after start date'); return; }
    const selected = Object.entries(edits).filter(([, value]) => value > 0);
    if (!selected.length) { setError('Enter an incentive for at least one product'); return; }
    setError(null); setSavedCount(null);
    try {
      const result = await bulkCreate.mutateAsync(selected.map(([productId, amountPerBox]) => ({ productId, validFrom, validTo, amountPerBox })));
      setEdits({}); setSavedCount(result.created);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Failed to assign incentives'); }
  };
  useSaveShortcut(() => void save());
  return <PageContainer title="Assign product incentives" subtitle="Set a fixed salesman incentive per sold box for a date range. Edit blue cells or apply one amount to all visible products." actions={<Stack direction="row" spacing={1} alignItems="center">{changedCount > 0 && <Chip label={`${changedCount} selected`} color="warning" size="small" />}<Button variant="outlined" startIcon={<RestartAltIcon />} disabled={!Object.keys(edits).length} onClick={() => setEdits({})}>Discard</Button><Button variant="contained" startIcon={<SaveIcon />} disabled={!changedCount || bulkCreate.isPending} onClick={() => void save()}>{bulkCreate.isPending ? 'Saving…' : `Save ${changedCount || ''}`}</Button></Stack>}>
    <Stack spacing={1.5}>
      {error && <Alert severity="error">{error}</Alert>}{savedCount !== null && <Alert severity="success">Assigned incentive to {savedCount} products.</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} flexWrap="wrap" useFlexGap>
        <TextField label="From *" type="date" size="small" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="To *" type="date" size="small" value={validTo} onChange={(e) => setValidTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Divider orientation="vertical" flexItem />
        <ProductFilterBar value={filters} showSeries onChange={(next) => { setFilters(next); pagination.setPage(1); }} />
        <Divider orientation="vertical" flexItem />
        <TextField label="Bulk ₹ / box" type="number" size="small" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} inputProps={{ min: 0, step: 0.01 }} sx={{ width: 150 }} />
        <Button variant="outlined" startIcon={<PlaylistAddCheckIcon />} onClick={applyToVisible}>Apply to visible</Button>
      </Stack>
      <DataTable rows={rows} columns={columns} meta={products.data?.meta} pagination={pagination} loading={products.isFetching} gridOptions={{ onCellValueChanged: (changed) => { const event = changed as CellValueChangedEvent<IncentiveRow>; if (event.data) { setSavedCount(null); setEdits((previous) => ({ ...previous, [event.data!.id]: num(event.data!.amountPerBox) })); } } }} searchPlaceholder="Search SKU or product…" height={620} />
    </Stack>
  </PageContainer>;
}
