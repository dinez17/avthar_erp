import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Button, Chip, Divider, MenuItem, Stack, TextField } from '@mui/material';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { BranchPriceItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { ProductFilterBar } from './ProductFilterBar';
import type { ProductFilters } from './api';
import { useBranchPrices, useBranches, useBulkUpdateBranchPrices } from './branch-prices-api';

interface PriceEdit {
  displayPrice: number;
  minSellingPrice: number;
  sellingPrice: number;
  version: number;
}

/** Grid row = branch price plus derived margin over landing cost. */
type PriceRow = BranchPriceItem & { marginPct: number | null };

type BulkField = 'displayPrice' | 'minSellingPrice' | 'sellingPrice';

const BULK_FIELDS: { value: BulkField; label: string }[] = [
  { value: 'displayPrice', label: 'Display price' },
  { value: 'minSellingPrice', label: 'Min selling price' },
  { value: 'sellingPrice', label: 'Actual selling price' },
];

type BulkMode = 'set' | 'markupOnLanding';

const num = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Branch-wise selling price editor. Display / minimum / actual prices are edited
 * inline per branch; margin over landing cost previews live.
 */
export function SellingPricesPage(): JSX.Element {
  const pagination = usePagination({ initialPageSize: 50 });
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [filters, setFilters] = useState<ProductFilters>({});
  const { data, isFetching, refetch } = useBranchPrices(branchId || undefined, pagination.query, filters);
  const bulkUpdate = useBulkUpdateBranchPrices();

  const [edits, setEdits] = useState<Record<string, PriceEdit>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const [bulkField, setBulkField] = useState<BulkField>('sellingPrice');
  const [bulkMode, setBulkMode] = useState<BulkMode>('set');
  const [bulkValue, setBulkValue] = useState('');

  const items = data?.items ?? [];

  const effective = (item: BranchPriceItem): PriceEdit =>
    edits[item.productId] ?? {
      displayPrice: item.displayPrice ?? 0,
      minSellingPrice: item.minSellingPrice ?? 0,
      sellingPrice: item.sellingPrice ?? 0,
      version: item.version,
    };

  const rows = useMemo<PriceRow[]>(
    () =>
      items.map((item) => {
        const current = effective(item);
        const marginPct =
          item.landingCost && item.landingCost > 0 && current.sellingPrice > 0
            ? round2(((current.sellingPrice - item.landingCost) / item.landingCost) * 100)
            : null;
        return { ...item, ...current, marginPct };
      }),
    [items, edits],
  );

  const onCellValueChanged = (event: CellValueChangedEvent<PriceRow>): void => {
    const row = event.data;
    if (!row) return;
    setSavedCount(null);
    setEdits((prev) => ({
      ...prev,
      [row.productId]: {
        displayPrice: num(row.displayPrice, 0),
        minSellingPrice: num(row.minSellingPrice, 0),
        sellingPrice: num(row.sellingPrice, 0),
        version: prev[row.productId]?.version ?? row.version,
      },
    }));
  };

  const applyToAll = (): void => {
    const value = Number(bulkValue);
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter a valid non-negative number to apply');
      return;
    }
    setError(null);
    setSavedCount(null);
    setEdits((prev) => {
      const next = { ...prev };
      for (const item of items) {
        const current = next[item.productId] ?? effective(item);
        const computed =
          bulkMode === 'set'
            ? value
            : item.landingCost === null
              ? current[bulkField]
              : round2(item.landingCost * (1 + value / 100));
        next[item.productId] = { ...current, [bulkField]: computed };
      }
      return next;
    });
  };

  const dirtyCount = Object.keys(edits).length;

  const save = async (): Promise<void> => {
    setError(null);
    setSavedCount(null);
    try {
      const payload = Object.entries(edits).map(([productId, edit]) => ({
        productId,
        displayPrice: edit.displayPrice,
        minSellingPrice: edit.minSellingPrice,
        sellingPrice: edit.sellingPrice,
        version: edit.version,
      }));
      const updated = await bulkUpdate.mutateAsync({ branchId, items: payload });
      setEdits({});
      setSavedCount(updated.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save prices');
      void refetch();
    }
  };

  const editableCol = (field: BulkField, headerName: string): ColDef<PriceRow> => ({
    field,
    headerName,
    editable: true,
    maxWidth: 160,
    valueParser: (p) => num(p.newValue, num(p.oldValue, 0)),
    cellStyle: { backgroundColor: 'rgba(11, 95, 255, 0.06)' },
    valueFormatter: (p) => (p.value === null || p.value === undefined ? '—' : String(p.value)),
  });

  const columns = useMemo<ColDef<PriceRow>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 150 },
      { field: 'name', headerName: 'Name', minWidth: 200 },
      { field: 'brandName', headerName: 'Brand', minWidth: 120 },
      { field: 'sizeMm', headerName: 'Size', maxWidth: 110 },
      {
        field: 'landingCost',
        headerName: 'Landing ₹',
        maxWidth: 130,
        valueFormatter: (p) => (p.value === null || p.value === undefined ? '—' : String(p.value)),
      },
      editableCol('displayPrice', 'Display ₹'),
      editableCol('minSellingPrice', 'Min selling ₹'),
      editableCol('sellingPrice', 'Actual selling ₹'),
      {
        field: 'marginPct',
        headerName: 'Margin %',
        maxWidth: 120,
        valueFormatter: (p) => (p.value === null || p.value === undefined ? '—' : `${p.value}%`),
        cellStyle: (p) => ({
          fontWeight: 600,
          color: typeof p.value === 'number' && p.value < 0 ? '#c62828' : 'inherit',
        }),
      },
    ],
    [],
  );

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void save());

  return (
    <PageContainer
      title="Selling prices"
      subtitle="Branch-wise display, minimum and actual selling prices per box."
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          {dirtyCount > 0 && <Chip label={`${dirtyCount} unsaved`} color="warning" size="small" />}
          <Button
            variant="outlined"
            startIcon={<RestartAltIcon />}
            disabled={dirtyCount === 0}
            onClick={() => {
              setEdits({});
              setError(null);
            }}
          >
            Discard
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={dirtyCount === 0 || bulkUpdate.isPending}
            onClick={() => void save()}
          >
            {bulkUpdate.isPending ? 'Saving…' : `Save ${dirtyCount || ''}`}
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        {error && <Alert severity="error">{error}</Alert>}
        {savedCount !== null && (
          <Alert severity="success">Updated prices for {savedCount} products.</Alert>
        )}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            select
            label="Branch"
            size="small"
            fullWidth={false}
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setEdits({});
              pagination.setPage(1);
            }}
            sx={{ width: 200 }}
          >
            {(branches.data ?? []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
                {branch.code ? ` (${branch.code})` : ''}
              </MenuItem>
            ))}
          </TextField>
          {branchId && (
            <>
              <Divider orientation="vertical" flexItem />
              <ProductFilterBar
                value={filters}
                showSeries
                onChange={(next) => {
                  setFilters(next);
                  pagination.setPage(1);
                }}
              />
              <Divider orientation="vertical" flexItem />
              <TextField
                select
                size="small"
                fullWidth={false}
                label="Bulk set"
                value={bulkField}
                onChange={(e) => setBulkField(e.target.value as BulkField)}
                sx={{ width: 160 }}
              >
                {BULK_FIELDS.map((field) => (
                  <MenuItem key={field.value} value={field.value}>
                    {field.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                fullWidth={false}
                label="Mode"
                value={bulkMode}
                onChange={(e) => setBulkMode(e.target.value as BulkMode)}
                sx={{ width: 130 }}
              >
                <MenuItem value="set">Fixed ₹</MenuItem>
                <MenuItem value="markupOnLanding">Markup %</MenuItem>
              </TextField>
              <TextField
                size="small"
                type="number"
                fullWidth={false}
                label={bulkMode === 'set' ? '₹' : '%'}
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                sx={{ width: 100 }}
              />
              <Button
                variant="outlined"
                startIcon={<PlaylistAddCheckIcon />}
                onClick={applyToAll}
                disabled={bulkValue === '' || items.length === 0}
              >
                Apply ({items.length})
              </Button>
            </>
          )}
        </Stack>

        {!branchId ? (
          <Alert severity="info">Select a branch to view and edit its selling prices.</Alert>
        ) : (
          <>

            <DataTable
              rows={rows}
              columns={columns}
              meta={data?.meta}
              pagination={pagination}
              loading={isFetching}
              searchPlaceholder="Search by name, SKU…"
              height={600}
              gridOptions={{
                getRowId: (p) => p.data.productId,
                onCellValueChanged,
                stopEditingWhenCellsLoseFocus: true,
                singleClickEdit: true,
              }}
            />
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
