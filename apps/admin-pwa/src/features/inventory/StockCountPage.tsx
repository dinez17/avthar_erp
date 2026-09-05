import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { formatStockQuantity, splitBoxesPieces } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { StockBalanceItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useCatalogOptions } from '../catalog/api';
import { useBranches } from '../products/branch-prices-api';
import { useBulkSetStock, useCountSheet, useGodowns, useStockBalances } from './api';

interface CountEdit {
  boxes: number;
  pieces: number;
}

/** Grid row: the current balance plus the counted quantity being entered. */
type CountRow = StockBalanceItem & {
  countBoxes: number;
  countPieces: number;
  /** Difference in boxes between counted and current. */
  diffBoxes: number;
  /** Counted quantity expressed in square feet. */
  countSqft: number;
};

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * Bulk stock count. Enter the physically counted boxes and loose pieces; saving posts
 * adjustment movements for the differences, so the ledger records what actually changed.
 */
export function StockCountPage(): JSX.Element {
  const pagination = usePagination({ initialPageSize: 100 });
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const godowns = useGodowns(branchId || undefined);
  const [godownId, setGodownId] = useState('');
  const brands = useCatalogOptions('/brands');
  const [brandId, setBrandId] = useState('');
  const [reason, setReason] = useState('Physical stock count');

  const ready = Boolean(branchId && godownId);
  const [showAllProducts, setShowAllProducts] = useState(true);
  const filters = {
    branchId: branchId || undefined,
    godownId: godownId || undefined,
    brandId: brandId || undefined,
  };
  const inStock = useStockBalances(pagination.query, filters, ready && !showAllProducts);
  const countSheet = useCountSheet(
    branchId || undefined,
    godownId || undefined,
    pagination.query,
    { brandId: brandId || undefined },
    ready && showAllProducts,
  );
  const { data, isFetching, refetch } = showAllProducts ? countSheet : inStock;
  const bulkSet = useBulkSetStock();

  const [edits, setEdits] = useState<Record<string, CountEdit>>({});
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const items = data?.items ?? [];

  /** Stable identity for a stock key across product/batch/shade. */
  const rowKey = (item: StockBalanceItem): string =>
    `${item.productId}|${item.batchNo ?? ''}|${item.shade ?? ''}`;

  /** The product's conversion factor, supplied by the API for every row. */
  const piecesPerBox = (item: StockBalanceItem): number => item.piecesPerBox;

  const rows = useMemo<CountRow[]>(
    () =>
      items.map((item) => {
        const key = rowKey(item);
        const edit = edits[key];
        const ppb = piecesPerBox(item);
        // Piece-based products are counted purely in pieces; box-based products split
        // into whole boxes plus the loose remainder.
        const isPieceUom = item.baseUom === 'PIECE';
        const split = splitBoxesPieces(item.qtyBoxes, ppb);
        const defaults = isPieceUom
          ? { boxes: 0, pieces: Math.round(item.qtyPieces) }
          : split;
        const countBoxes = edit ? edit.boxes : defaults.boxes;
        const countPieces = edit ? edit.pieces : defaults.pieces;
        const target = round3(countBoxes + (ppb > 0 ? countPieces / ppb : 0));
        const sqftPerBox = item.qtyBoxes > 0 ? item.qtySqft / item.qtyBoxes : 0;
        return {
          ...item,
          countBoxes,
          countPieces,
          diffBoxes: round3(target - item.qtyBoxes),
          countSqft: round3(target * sqftPerBox),
        };
      }),
    [items, edits],
  );

  const onCellValueChanged = (event: CellValueChangedEvent<CountRow>): void => {
    const row = event.data;
    if (!row) return;
    setSummary(null);
    setEdits((prev) => ({
      ...prev,
      [rowKey(row)]: { boxes: num(row.countBoxes), pieces: num(row.countPieces) },
    }));
  };

  const dirtyCount = rows.filter((r) => r.diffBoxes !== 0).length;

  const save = async (): Promise<void> => {
    setError(null);
    setSummary(null);
    if (!reason.trim()) {
      setError('Enter a reason for the count');
      return;
    }
    const changed = rows.filter((r) => r.diffBoxes !== 0);
    if (changed.length === 0) {
      setError('Nothing to post — no counted quantity differs from current stock');
      return;
    }
    try {
      const result = await bulkSet.mutateAsync({
        branchId,
        godownId,
        reason: reason.trim(),
        lines: changed.map((row) => ({
          productId: row.productId,
          batchNo: row.batchNo,
          shade: row.shade,
          boxes: row.countBoxes,
          pieces: row.countPieces,
        })),
      });
      setEdits({});
      setSummary(
        `Posted ${result.posted} adjustment(s); ${result.unchanged} line(s) already matched.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post the count');
      void refetch();
    }
  };

  const columns = useMemo<ColDef<CountRow>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 150 },
      { field: 'productName', headerName: 'Product', minWidth: 190 },
      { field: 'batchNo', headerName: 'Batch', maxWidth: 100 },
      { field: 'shade', headerName: 'Shade', maxWidth: 100 },
      {
        headerName: 'Current box',
        maxWidth: 130,
        valueGetter: (p) =>
          p.data && p.data.baseUom !== 'PIECE'
            ? splitBoxesPieces(p.data.qtyBoxes, p.data.piecesPerBox).boxes
            : '',
      },
      {
        headerName: 'Current pcs',
        maxWidth: 130,
        valueGetter: (p) => {
          if (!p.data) return '';
          return p.data.baseUom === 'PIECE'
            ? Math.round(p.data.qtyPieces)
            : splitBoxesPieces(p.data.qtyBoxes, p.data.piecesPerBox).pieces;
        },
      },
      {
        headerName: 'Current sq.ft',
        maxWidth: 130,
        valueGetter: (p) => (p.data ? Math.round(p.data.qtySqft * 100) / 100 : ''),
      },
      {
        field: 'countBoxes',
        headerName: 'Counted box',
        editable: (p) => p.data?.baseUom !== 'PIECE',
        maxWidth: 140,
        valueParser: (p) => num(p.newValue, num(p.oldValue)),
        valueFormatter: (p) => (p.data?.baseUom === 'PIECE' ? '' : String(p.value ?? '')),
        cellStyle: (p) => ({
          backgroundColor:
            p.data?.baseUom === 'PIECE' ? 'transparent' : 'rgba(11, 95, 255, 0.06)',
        }),
      },
      {
        field: 'countPieces',
        headerName: 'Counted pcs',
        editable: true,
        maxWidth: 130,
        valueParser: (p) => num(p.newValue, num(p.oldValue)),
        cellStyle: { backgroundColor: 'rgba(11, 95, 255, 0.06)' },
      },
      {
        field: 'countSqft',
        headerName: 'Counted sq.ft',
        maxWidth: 140,
        valueFormatter: (p) => (p.value ? String(p.value) : ''),
      },
      {
        field: 'diffBoxes',
        headerName: 'Difference',
        maxWidth: 150,
        valueFormatter: (p) => {
          const delta = p.value as number;
          if (!delta) return '—';
          const row = p.data;
          const sign = delta > 0 ? '+' : '−';
          if (!row) return `${sign}${Math.abs(delta)}`;
          return `${sign}${formatStockQuantity(
            Math.abs(delta),
            row.piecesPerBox,
            row.qtyBoxes > 0 ? row.qtySqft / row.qtyBoxes : 0,
            row.baseUom,
          )}`;
        },
        cellStyle: (p) => ({
          fontWeight: 600,
          color:
            p.value === 0 ? 'inherit' : (p.value as number) > 0 ? '#1e874b' : '#c62828',
        }),
      },
    ],
    [],
  );

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void save());

  return (
    <PageContainer
      title="Stock count"
      subtitle="Enter counted boxes and loose pieces; differences are posted as adjustments."
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          {dirtyCount > 0 && <Chip label={`${dirtyCount} to post`} color="warning" size="small" />}
          <Button
            variant="outlined"
            startIcon={<RestartAltIcon />}
            disabled={Object.keys(edits).length === 0}
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
            disabled={!ready || dirtyCount === 0 || bulkSet.isPending}
            onClick={() => void save()}
          >
            {bulkSet.isPending ? 'Posting…' : `Post ${dirtyCount || ''}`}
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1}>
        {error && <Alert severity="error">{error}</Alert>}
        {summary && <Alert severity="success">{summary}</Alert>}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            select
            label="Branch"
            size="small"
            fullWidth={false}
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setGodownId('');
              setEdits({});
            }}
            sx={{ width: 180 }}
          >
            {(branches.data ?? []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Godown"
            size="small"
            fullWidth={false}
            value={godownId}
            onChange={(e) => {
              setGodownId(e.target.value);
              setEdits({});
            }}
            disabled={!branchId}
            sx={{ width: 180 }}
          >
            {(godowns.data ?? []).map((godown) => (
              <MenuItem key={godown.id} value={godown.id}>
                {godown.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Brand"
            size="small"
            fullWidth={false}
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            sx={{ width: 160 }}
          >
            <MenuItem value="">All brands</MenuItem>
            {(brands.data ?? []).map((brand) => (
              <MenuItem key={brand.id} value={brand.id}>
                {brand.name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showAllProducts}
                onChange={(e) => {
                  setShowAllProducts(e.target.checked);
                  setEdits({});
                  pagination.setPage(1);
                }}
              />
            }
            label="Show all products"
          />
          <Divider orientation="vertical" flexItem />
          <TextField
            label="Reason"
            size="small"
            fullWidth={false}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ width: 240 }}
          />
        </Stack>

        {!ready ? (
          <Alert severity="info">Select a branch and godown to count its stock.</Alert>
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            meta={data?.meta}
            pagination={pagination}
            loading={isFetching}
            searchPlaceholder="Search by product or SKU…"
            height={600}
            gridOptions={{
              getRowId: (p) => `${p.data.productId}|${p.data.batchNo ?? ''}|${p.data.shade ?? ''}`,
              onCellValueChanged,
              stopEditingWhenCellsLoseFocus: true,
              singleClickEdit: true,
            }}
          />
        )}
      </Stack>
    </PageContainer>
  );
}
