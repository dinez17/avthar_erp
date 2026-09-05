import HistoryIcon from '@mui/icons-material/History';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Alert,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { splitBoxesPieces } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import type { StockBalanceItem, StockMovementItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { useCatalogOptions } from '../catalog/api';
import { useProducts } from '../products/api';
import { useBranches } from '../products/branch-prices-api';
import { StockEntryDialog } from './StockEntryDialog';
import { useGodowns, useStockBalances, useStockMovements } from './api';

const MOVEMENT_COLORS: Record<string, 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  OPENING: 'info',
  PURCHASE: 'success',
  SALE: 'warning',
  ADJUSTMENT: 'default',
  TRANSFER_IN: 'success',
  TRANSFER_OUT: 'error',
};

/** Stock on hand and the movement ledger behind it. */
export function StockPage(): JSX.Element {
  const [tab, setTab] = useState(0);
  const balancePagination = usePagination({ initialPageSize: 50 });
  const movementPagination = usePagination({ initialPageSize: 50 });

  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const godowns = useGodowns(branchId || undefined);
  const brands = useCatalogOptions('/brands');
  const [godownId, setGodownId] = useState('');
  const [brandId, setBrandId] = useState('');
  // Batch/shade rows are merged by default so a product reads as one line.
  const [groupByProduct, setGroupByProduct] = useState(true);

  const products = useProducts({ page: 1, pageSize: 200, sortOrder: 'asc' }, {});

  const filters = {
    branchId: branchId || undefined,
    godownId: godownId || undefined,
    brandId: brandId || undefined,
    groupByProduct: groupByProduct ? 'true' : undefined,
  };

  const balances = useStockBalances(balancePagination.query, filters, Boolean(branchId));
  const movements = useStockMovements(movementPagination.query, filters, Boolean(branchId));

  const [dialogMode, setDialogMode] = useState<'opening' | 'adjustment' | null>(null);

  const balanceColumns = useMemo<ColDef<StockBalanceItem>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 150 },
      { field: 'productName', headerName: 'Product', minWidth: 200 },
      { field: 'brandName', headerName: 'Brand', maxWidth: 130 },
      { field: 'sizeMm', headerName: 'Size', maxWidth: 100 },
      { field: 'godownName', headerName: 'Godown', minWidth: 140 },
      ...(groupByProduct
        ? []
        : ([
            { field: 'batchNo', headerName: 'Batch', maxWidth: 110 },
            { field: 'shade', headerName: 'Shade', maxWidth: 110 },
          ] as ColDef<StockBalanceItem>[])),
      {
        headerName: 'Box',
        maxWidth: 100,
        cellStyle: { fontWeight: 600 },
        // Box-based products show whole boxes; piece-based stock has no box figure.
        valueGetter: (p) =>
          p.data && p.data.baseUom !== 'PIECE'
            ? splitBoxesPieces(p.data.qtyBoxes, p.data.piecesPerBox).boxes
            : '',
      },
      {
        headerName: 'Pcs',
        maxWidth: 100,
        cellStyle: { fontWeight: 600 },
        // Piece-based products report their full piece count; others the loose remainder.
        valueGetter: (p) => {
          if (!p.data) return '';
          return p.data.baseUom === 'PIECE'
            ? Math.round(p.data.qtyPieces)
            : splitBoxesPieces(p.data.qtyBoxes, p.data.piecesPerBox).pieces;
        },
      },
      {
        headerName: 'Sq.ft',
        maxWidth: 110,
        valueGetter: (p) => (p.data ? Math.round(p.data.qtySqft * 100) / 100 : ''),
      },
    ],
    [groupByProduct],
  );

  const movementColumns = useMemo<ColDef<StockMovementItem>[]>(
    () => [
      {
        field: 'movementDate',
        headerName: 'Date',
        minWidth: 160,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleString() : ''),
      },
      { field: 'sku', headerName: 'SKU', minWidth: 140 },
      { field: 'productName', headerName: 'Product', minWidth: 180 },
      { field: 'godownName', headerName: 'Godown', maxWidth: 140 },
      {
        field: 'type',
        headerName: 'Type',
        maxWidth: 140,
        cellRenderer: (p: ICellRendererParams<StockMovementItem>) => (
          <Chip
            label={p.value as string}
            size="small"
            color={MOVEMENT_COLORS[p.value as string] ?? 'default'}
          />
        ),
      },
      {
        field: 'qtyBoxes',
        headerName: 'Boxes',
        maxWidth: 120,
        valueGetter: (p) =>
          p.data ? `${p.data.direction === 'IN' ? '+' : '−'}${p.data.qtyBoxes}` : '',
        cellStyle: (p) => ({
          fontWeight: 600,
          color: String(p.value).startsWith('+') ? '#1e874b' : '#c62828',
        }),
      },
      { field: 'batchNo', headerName: 'Batch', maxWidth: 110 },
      { field: 'reason', headerName: 'Reason', minWidth: 160 },
      { field: 'refNumber', headerName: 'Reference', minWidth: 130 },
    ],
    [],
  );

  return (
    <PageContainer
      title="Stock"
      subtitle="On-hand quantities and the movement ledger. Stock changes only by posting movements."
      actions={
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<PlaylistAddIcon />}
            disabled={!branchId}
            onClick={() => setDialogMode('opening')}
          >
            Opening stock
          </Button>
          <Button
            variant="contained"
            startIcon={<TuneIcon />}
            disabled={!branchId}
            onClick={() => setDialogMode('adjustment')}
          >
            Adjust
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1}>
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
            }}
            sx={{ width: 200 }}
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
            onChange={(e) => setGodownId(e.target.value)}
            disabled={!branchId}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All godowns</MenuItem>
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
            sx={{ width: 170 }}
          >
            <MenuItem value="">All brands</MenuItem>
            {(brands.data ?? []).map((brand) => (
              <MenuItem key={brand.id} value={brand.id}>
                {brand.name}
              </MenuItem>
            ))}
          </TextField>
          {tab === 0 && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={groupByProduct}
                  onChange={(e) => {
                    setGroupByProduct(e.target.checked);
                    balancePagination.setPage(1);
                  }}
                />
              }
              label="Merge batches"
            />
          )}
        </Stack>

        {!branchId ? (
          <Alert severity="info">Select a branch to view its stock.</Alert>
        ) : (
          <>
            <Tabs value={tab} onChange={(_, value: number) => setTab(value)} sx={{ minHeight: 36 }}>
              <Tab label="On hand" sx={{ minHeight: 36, py: 0 }} />
              <Tab label="Ledger" icon={<HistoryIcon fontSize="small" />} iconPosition="start" sx={{ minHeight: 36, py: 0 }} />
            </Tabs>

            {tab === 0 ? (
              <DataTable
                rows={balances.data?.items ?? []}
                columns={balanceColumns}
                meta={balances.data?.meta}
                pagination={balancePagination}
                loading={balances.isFetching}
                searchPlaceholder="Search by product or SKU…"
                height={600}
              />
            ) : (
              <DataTable
                rows={movements.data?.items ?? []}
                columns={movementColumns}
                meta={movements.data?.meta}
                pagination={movementPagination}
                loading={movements.isFetching}
                searchPlaceholder="Search by product, SKU or reference…"
                height={600}
              />
            )}
          </>
        )}
      </Stack>

      {dialogMode && (
        <StockEntryDialog
          open
          mode={dialogMode}
          branchId={branchId}
          godowns={godowns.data ?? []}
          products={products.data?.items ?? []}
          onClose={() => setDialogMode(null)}
        />
      )}
    </PageContainer>
  );
}
