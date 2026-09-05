import DownloadIcon from '@mui/icons-material/Download';
import {
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Link,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { formatBoxPieces } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import type {
  AgeBucket,
  LowStockItem,
  StockAgeingItem,
  StockValuationItem,
} from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { useCatalogOptions } from '../catalog/api';
import { useBranches } from '../products/branch-prices-api';
import { useGodowns } from './api';
import { exportCsv } from './exportCsv';
import { useAgeingReport, useLowStockReport, useValuationReport } from './reports-api';

const currency = (value: number | null): string =>
  value === null ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Quantity shown the way the product is counted. */
const qtyLabel = (row: {
  qtyBoxes: number;
  piecesPerBox: number;
  baseUom: string;
}): string => formatBoxPieces(row.qtyBoxes, row.piecesPerBox, row.baseUom === 'PIECE');

const BUCKET_COLORS: Record<AgeBucket, 'success' | 'info' | 'warning' | 'error'> = {
  '0-30': 'success',
  '31-60': 'info',
  '61-90': 'warning',
  '90+': 'error',
};

/** Valuation, ageing and low-stock reporting over the stock projection. */
export function StockReportsPage(): JSX.Element {
  const [tab, setTab] = useState(0);
  const pagination = usePagination({ initialPageSize: 50 });

  const branches = useBranches();
  const brands = useCatalogOptions('/brands');
  const [branchId, setBranchId] = useState('');
  const [godownId, setGodownId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [groupByProduct, setGroupByProduct] = useState(true);
  // Row whose open purchase orders are being inspected.
  const [ordersFor, setOrdersFor] = useState<LowStockItem | null>(null);
  const godowns = useGodowns(branchId || undefined);

  const filters = {
    branchId: branchId || undefined,
    godownId: godownId || undefined,
    brandId: brandId || undefined,
    ...(groupByProduct ? { groupByProduct: 'true' } : {}),
  };

  const valuation = useValuationReport(pagination.query, filters, tab === 0);
  const ageing = useAgeingReport(pagination.query, filters, tab === 1);
  const lowStock = useLowStockReport(pagination.query, filters, tab === 2);

  const valuationColumns = useMemo<ColDef<StockValuationItem>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 150 },
      { field: 'productName', headerName: 'Product', minWidth: 190 },
      { field: 'brandName', headerName: 'Brand', maxWidth: 130 },
      { field: 'godownName', headerName: 'Godown', maxWidth: 140 },
      {
        headerName: 'Quantity',
        minWidth: 140,
        valueGetter: (p) => (p.data ? qtyLabel(p.data) : ''),
      },
      {
        field: 'landingCost',
        headerName: 'Landing ₹',
        maxWidth: 130,
        valueFormatter: (p) => currency(p.value as number | null),
      },
      {
        field: 'value',
        headerName: 'Value ₹',
        maxWidth: 150,
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => currency(p.value as number | null),
      },
    ],
    [],
  );

  const ageingColumns = useMemo<ColDef<StockAgeingItem>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 150 },
      { field: 'productName', headerName: 'Product', minWidth: 180 },
      { field: 'godownName', headerName: 'Godown', maxWidth: 140 },
      { field: 'batchNo', headerName: 'Batch', maxWidth: 110 },
      {
        headerName: 'Quantity',
        minWidth: 140,
        valueGetter: (p) => (p.data ? qtyLabel(p.data) : ''),
      },
      {
        field: 'lastInwardDate',
        headerName: 'Last inward',
        minWidth: 140,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : '—'),
      },
      { field: 'ageDays', headerName: 'Age (days)', maxWidth: 130 },
      {
        field: 'bucket',
        headerName: 'Bucket',
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<StockAgeingItem>) => (
          <Chip
            label={p.value as string}
            size="small"
            color={BUCKET_COLORS[p.value as AgeBucket] ?? 'default'}
          />
        ),
      },
      {
        field: 'value',
        headerName: 'Value ₹',
        maxWidth: 140,
        valueFormatter: (p) => currency(p.value as number | null),
      },
    ],
    [],
  );

  const lowStockColumns = useMemo<ColDef<LowStockItem>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 150 },
      { field: 'productName', headerName: 'Product', minWidth: 190 },
      { field: 'brandName', headerName: 'Brand', maxWidth: 130 },
      { field: 'branchName', headerName: 'Branch', maxWidth: 150 },
      {
        headerName: 'On hand',
        minWidth: 140,
        valueGetter: (p) => (p.data ? qtyLabel(p.data) : ''),
      },
      { field: 'reorderLevelBoxes', headerName: 'Reorder level', maxWidth: 140 },
      { field: 'shortfallBoxes', headerName: 'Shortfall (box)', maxWidth: 140 },
      {
        field: 'onOrderBoxes',
        headerName: 'On order (box)',
        maxWidth: 150,
        // Clicking the quantity opens the orders behind it.
        cellRenderer: (p: ICellRendererParams<LowStockItem>) => {
          const value = p.value as number;
          if (!value) return '\u2014';
          return (
            <Link
              component="button"
              underline="hover"
              onClick={() => p.data && setOrdersFor(p.data)}
              sx={{ color: '#1e874b', fontWeight: 600 }}
            >
              {value}
            </Link>
          );
        },
      },
      {
        field: 'netShortfallBoxes',
        headerName: 'To order (box)',
        maxWidth: 150,
        // Zero means the gap is already covered by open purchase orders.
        cellStyle: (p) => ({
          fontWeight: 600,
          color: (p.value as number) > 0 ? '#c62828' : '#1e874b',
        }),
        valueFormatter: (p) => ((p.value as number) > 0 ? String(p.value) : 'covered'),
      },
    ],
    [],
  );

  const download = (): void => {
    if (tab === 0) {
      exportCsv<StockValuationItem>(
        'stock-valuation',
        [
          { header: 'SKU', field: 'sku' },
          { header: 'Product', field: 'productName' },
          { header: 'Brand', field: 'brandName' },
          { header: 'Category', field: 'categoryName' },
          { header: 'Branch', field: 'branchName' },
          { header: 'Godown', field: 'godownName' },
          { header: 'Quantity', field: (row) => qtyLabel(row) },
          { header: 'Boxes', field: 'qtyBoxes' },
          { header: 'Landing cost', field: 'landingCost' },
          { header: 'Value', field: 'value' },
        ],
        valuation.data?.items ?? [],
      );
      return;
    }
    if (tab === 1) {
      exportCsv<StockAgeingItem>(
        'stock-ageing',
        [
          { header: 'SKU', field: 'sku' },
          { header: 'Product', field: 'productName' },
          { header: 'Godown', field: 'godownName' },
          { header: 'Batch', field: 'batchNo' },
          { header: 'Quantity', field: (row) => qtyLabel(row) },
          { header: 'Last inward', field: 'lastInwardDate' },
          { header: 'Age days', field: 'ageDays' },
          { header: 'Bucket', field: 'bucket' },
          { header: 'Value', field: 'value' },
        ],
        ageing.data?.items ?? [],
      );
      return;
    }
    exportCsv<LowStockItem>(
      'low-stock',
      [
        { header: 'SKU', field: 'sku' },
        { header: 'Product', field: 'productName' },
        { header: 'Brand', field: 'brandName' },
        { header: 'Branch', field: 'branchName' },
        { header: 'On hand boxes', field: 'qtyBoxes' },
        { header: 'Reorder level', field: 'reorderLevelBoxes' },
        { header: 'Shortfall', field: 'shortfallBoxes' },
        { header: 'On order', field: 'onOrderBoxes' },
        { header: 'Open POs', field: (row) => row.openOrders.map((o) => o.poNumber).join(' ') },
        { header: 'To order', field: 'netShortfallBoxes' },
      ],
      lowStock.data?.items ?? [],
    );
  };

  return (
    <PageContainer
      title="Stock reports"
      subtitle="Valuation at landing cost, ageing since last inward, and reorder alerts."
      actions={
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={download}>
          Export CSV
        </Button>
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
              pagination.setPage(1);
            }}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All branches</MenuItem>
            {(branches.data ?? []).map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
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
              pagination.setPage(1);
            }}
            disabled={!branchId || tab === 2}
            sx={{ width: 170 }}
          >
            <MenuItem value="">All godowns</MenuItem>
            {(godowns.data ?? []).map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Brand"
            size="small"
            fullWidth={false}
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 160 }}
          >
            <MenuItem value="">All brands</MenuItem>
            {(brands.data ?? []).map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
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
                    pagination.setPage(1);
                  }}
                />
              }
              label="Merge batches"
            />
          )}
        </Stack>

        <Tabs
          value={tab}
          onChange={(_, value: number) => {
            setTab(value);
            pagination.setPage(1);
          }}
          sx={{ minHeight: 36 }}
        >
          <Tab label="Valuation" sx={{ minHeight: 36, py: 0 }} />
          <Tab label="Ageing" sx={{ minHeight: 36, py: 0 }} />
          <Tab label="Low stock" sx={{ minHeight: 36, py: 0 }} />
        </Tabs>

        {tab === 0 && (
          <>
            <Card variant="outlined">
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <Typography variant="body2">
                    Total value:{' '}
                    <strong>{currency(valuation.data?.summary.totalValue ?? 0)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Total boxes: <strong>{valuation.data?.summary.totalBoxes ?? 0}</strong>
                  </Typography>
                  {(valuation.data?.summary.unvaluedRows ?? 0) > 0 && (
                    <Typography variant="body2" color="warning.main">
                      {valuation.data?.summary.unvaluedRows} row(s) have no landing cost and are
                      excluded from the total
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
            <DataTable
              rows={valuation.data?.items ?? []}
              columns={valuationColumns}
              meta={valuation.data?.meta}
              pagination={pagination}
              loading={valuation.isFetching}
              searchPlaceholder="Search by product or SKU…"
              height={560}
            />
          </>
        )}

        {tab === 1 && (
          <>
            <Card variant="outlined">
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  {(['0-30', '31-60', '61-90', '90+'] as AgeBucket[]).map((bucket) => (
                    <Chip
                      key={bucket}
                      color={BUCKET_COLORS[bucket]}
                      size="small"
                      label={`${bucket} days: ${ageing.data?.summary.buckets[bucket].boxes ?? 0} box · ${currency(
                        ageing.data?.summary.buckets[bucket].value ?? 0,
                      )}`}
                    />
                  ))}
                </Stack>
              </CardContent>
            </Card>
            <DataTable
              rows={ageing.data?.items ?? []}
              columns={ageingColumns}
              meta={ageing.data?.meta}
              pagination={pagination}
              loading={ageing.isFetching}
              searchPlaceholder="Search by product or SKU…"
              height={560}
            />
          </>
        )}

        {tab === 2 && (
          <DataTable
            rows={lowStock.data?.items ?? []}
            columns={lowStockColumns}
            meta={lowStock.data?.meta}
            pagination={pagination}
            loading={lowStock.isFetching}
            searchPlaceholder="Search by product or SKU…"
            height={600}
          />
        )}
      </Stack>
      <Dialog open={ordersFor !== null} onClose={() => setOrdersFor(null)} maxWidth="md" fullWidth>
        <DialogTitle>Open orders — {ordersFor?.productName}</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary">
              {ordersFor?.sku} · {ordersFor?.branchName} ·{' '}
              {ordersFor
                ? formatBoxPieces(
                    ordersFor.onOrderBoxes,
                    ordersFor.piecesPerBox,
                    ordersFor.baseUom === 'PIECE',
                  )
                : ''}{' '}
              pending across {ordersFor?.openOrders.length ?? 0} order(s)
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>PO number</TableCell>
                  <TableCell>Supplier</TableCell>
                  <TableCell>Ordered on</TableCell>
                  <TableCell>Expected</TableCell>
                  <TableCell align="right">Ordered</TableCell>
                  <TableCell align="right">Received</TableCell>
                  <TableCell align="right">Pending</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(ordersFor?.openOrders ?? []).map((order) => (
                  <TableRow key={order.orderId}>
                    <TableCell>{order.poNumber}</TableCell>
                    <TableCell>{order.supplierName}</TableCell>
                    <TableCell>{new Date(order.orderDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {order.expectedDate
                        ? new Date(order.expectedDate).toLocaleDateString()
                        : '\u2014'}
                    </TableCell>
                    <TableCell align="right">
                      {formatBoxPieces(
                        order.orderedBoxes,
                        ordersFor?.piecesPerBox ?? 1,
                        ordersFor?.baseUom === 'PIECE',
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {formatBoxPieces(
                        order.receivedBoxes,
                        ordersFor?.piecesPerBox ?? 1,
                        ordersFor?.baseUom === 'PIECE',
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatBoxPieces(
                        order.pendingBoxes,
                        ordersFor?.piecesPerBox ?? 1,
                        ordersFor?.baseUom === 'PIECE',
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Stack>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
