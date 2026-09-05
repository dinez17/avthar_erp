import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Button, Chip, Divider, MenuItem, Stack, TextField } from '@mui/material';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { calculateGstAmount, calculateLandingCost } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { ProductItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { ProductFilterBar } from './ProductFilterBar';
import { useBulkUpdateRates, useProducts } from './api';
import type { ProductFilters } from './api';

interface RateEdit {
  purchaseRate: number;
  transportRate: number;
  additionalRate: number;
  gstRate: number;
  version: number;
}

/** Grid row = product plus derived GST amount, reflecting any pending edits. */
type RateRow = ProductItem & { gstAmount: number };

/** Which column a bulk "apply to all" action targets. */
type BulkField = 'purchaseRate' | 'transportRate' | 'additionalRate' | 'gstRate';

const BULK_FIELDS: { value: BulkField; label: string }[] = [
  { value: 'purchaseRate', label: 'Purchase ₹' },
  { value: 'transportRate', label: 'Transport ₹' },
  { value: 'additionalRate', label: 'Additional ₹' },
  { value: 'gstRate', label: 'GST %' },
];

const num = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * Dedicated bulk purchase-rate editor. Purchase, transport, additional and GST% are
 * editable inline (GST corrections are saved back to the product); GST amount and
 * landing cost preview live using the shared pricing formulas.
 */
export function PurchaseRatesPage(): JSX.Element {
  const pagination = usePagination({ initialPageSize: 50 });
  const [filters, setFilters] = useState<ProductFilters>({});
  const { data, isFetching, refetch } = useProducts(pagination.query, filters);
  const bulkUpdate = useBulkUpdateRates();

  const [edits, setEdits] = useState<Record<string, RateEdit>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const [bulkField, setBulkField] = useState<BulkField>('purchaseRate');
  const [bulkValue, setBulkValue] = useState('');

  const products = data?.items ?? [];

  /** Current (possibly edited) values for a product. */
  const effective = (product: ProductItem): RateEdit => {
    const edit = edits[product.id];
    return (
      edit ?? {
        purchaseRate: product.purchaseRate ?? 0,
        transportRate: product.transportRate,
        additionalRate: product.additionalRate,
        gstRate: product.gstRate,
        version: product.version,
      }
    );
  };

  const rows = useMemo<RateRow[]>(
    () =>
      products.map((product) => {
        const current = effective(product);
        return {
          ...product,
          purchaseRate: current.purchaseRate,
          transportRate: current.transportRate,
          additionalRate: current.additionalRate,
          gstRate: current.gstRate,
          gstAmount: calculateGstAmount(
            current.purchaseRate,
            current.transportRate,
            current.additionalRate,
            current.gstRate,
          ),
          landingCost: calculateLandingCost(
            current.purchaseRate,
            current.transportRate,
            current.additionalRate,
            current.gstRate,
          ),
        };
      }),
    [products, edits],
  );

  const onCellValueChanged = (event: CellValueChangedEvent<RateRow>): void => {
    const row = event.data;
    if (!row) return;
    setSavedCount(null);
    setEdits((prev) => ({
      ...prev,
      [row.id]: {
        purchaseRate: num(row.purchaseRate, 0),
        transportRate: num(row.transportRate, 0),
        additionalRate: num(row.additionalRate, 0),
        gstRate: num(row.gstRate, 0),
        version: prev[row.id]?.version ?? row.version,
      },
    }));
  };

  /** Applies the entered value to the chosen column across every visible row. */
  const applyToAll = (): void => {
    const value = Number(bulkValue);
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter a valid non-negative number to apply');
      return;
    }
    if (bulkField === 'gstRate' && value > 28) {
      setError('GST rate must be between 0 and 28');
      return;
    }
    setError(null);
    setSavedCount(null);
    setEdits((prev) => {
      const next = { ...prev };
      for (const product of products) {
        const current = next[product.id] ?? effective(product);
        next[product.id] = { ...current, [bulkField]: value };
      }
      return next;
    });
  };

  const dirtyCount = Object.keys(edits).length;

  const save = async (): Promise<void> => {
    setError(null);
    setSavedCount(null);
    try {
      const items = Object.entries(edits).map(([productId, edit]) => ({
        productId,
        purchaseRate: edit.purchaseRate,
        transportRate: edit.transportRate,
        additionalRate: edit.additionalRate,
        gstRate: edit.gstRate,
        version: edit.version,
      }));
      const updated = await bulkUpdate.mutateAsync({ items });
      setEdits({});
      setSavedCount(updated.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save rates');
      void refetch();
    }
  };

  const editableNumberCol = (
    field: 'purchaseRate' | 'transportRate' | 'additionalRate' | 'gstRate',
    headerName: string,
    width = 130,
  ): ColDef<RateRow> => ({
    field,
    headerName,
    editable: true,
    maxWidth: width,
    valueParser: (p) => num(p.newValue, num(p.oldValue, 0)),
    cellStyle: { backgroundColor: 'rgba(11, 95, 255, 0.06)' },
  });

  const columns = useMemo<ColDef<RateRow>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 150 },
      { field: 'name', headerName: 'Name', minWidth: 200 },
      { field: 'brandName', headerName: 'Brand', minWidth: 120 },
      editableNumberCol('purchaseRate', 'Purchase ₹'),
      editableNumberCol('transportRate', 'Transport ₹'),
      editableNumberCol('additionalRate', 'Additional ₹'),
      editableNumberCol('gstRate', 'GST %', 110),
      {
        field: 'gstAmount',
        headerName: 'GST ₹',
        maxWidth: 120,
        valueFormatter: (p) => (p.value === undefined ? '—' : String(p.value)),
      },
      {
        field: 'landingCost',
        headerName: 'Landing ₹',
        maxWidth: 140,
        valueFormatter: (p) => (p.value === null || p.value === undefined ? '—' : String(p.value)),
        cellStyle: { fontWeight: 600 },
      },
    ],
    [],
  );

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void save());

  return (
    <PageContainer
      title="Purchase rates"
      subtitle="Landing cost = (purchase + transport + additional) + GST. Edit any blue cell."
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
          <Alert severity="success">Updated rates for {savedCount} products.</Alert>
        )}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
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
            sx={{ width: 150 }}
          >
            {BULK_FIELDS.map((field) => (
              <MenuItem key={field.value} value={field.value}>
                {field.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="number"
            fullWidth={false}
            label="Value"
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            sx={{ width: 110 }}
          />
          <Button
            variant="outlined"
            startIcon={<PlaylistAddCheckIcon />}
            onClick={applyToAll}
            disabled={bulkValue === '' || products.length === 0}
          >
            Apply ({products.length})
          </Button>
        </Stack>

        <DataTable
          rows={rows}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by name, SKU…"
          height={620}
          gridOptions={{
            getRowId: (p) => p.data.id,
            onCellValueChanged,
            stopEditingWhenCellsLoseFocus: true,
            singleClickEdit: true,
          }}
        />
      </Stack>
    </PageContainer>
  );
}
