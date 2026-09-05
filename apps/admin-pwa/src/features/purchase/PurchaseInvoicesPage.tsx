import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import EditIcon from '@mui/icons-material/Edit';
import PublishIcon from '@mui/icons-material/Publish';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type {
  PurchaseInvoiceItem,
  PurchaseInvoiceStatus,
  SupplierRateItem,
} from '@tiles-erp/shared-types';
import { formatBoxPieces } from '@tiles-erp/shared';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { PurchaseInvoiceDialog } from './PurchaseInvoiceDialog';
import { useSuppliers } from './api';
import {
  usePostPurchaseInvoice,
  usePurchaseInvoice,
  usePurchaseInvoices,
  useRateHistory,
} from './invoices-api';

const STATUS_COLORS: Record<PurchaseInvoiceStatus, 'default' | 'success' | 'error'> = {
  DRAFT: 'default',
  POSTED: 'success',
  CANCELLED: 'error',
};

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Purchase invoices and the supplier rate history they generate. */
export function PurchaseInvoicesPage(): JSX.Element {
  const [tab, setTab] = useState(0);
  const pagination = usePagination();
  const suppliers = useSuppliers();
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');

  const { data, isFetching } = usePurchaseInvoices(pagination.query, {
    supplierId: supplierId || undefined,
    branchId: branchId || undefined,
  });
  const rates = useRateHistory(undefined, supplierId || undefined, tab === 1);
  const postInvoice = usePostPurchaseInvoice();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseInvoiceItem | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [posting, setPosting] = useState<PurchaseInvoiceItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detail = usePurchaseInvoice(viewingId);
  const editDetail = usePurchaseInvoice(editing?.id ?? null);

  const invoiceColumns = useMemo<ColDef<PurchaseInvoiceItem>[]>(
    () => [
      { field: 'invoiceNumber', headerName: 'Invoice no', minWidth: 150 },
      { field: 'supplierInvoiceNo', headerName: 'Supplier bill', minWidth: 140 },
      {
        field: 'invoiceDate',
        headerName: 'Date',
        minWidth: 120,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'supplierName', headerName: 'Supplier', minWidth: 180 },
      { field: 'grnNumber', headerName: 'GRN', minWidth: 140 },
      {
        field: 'dueDate',
        headerName: 'Due',
        minWidth: 120,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : '—'),
      },
      {
        field: 'grandTotal',
        headerName: 'Total',
        maxWidth: 150,
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'status',
        headerName: 'Status',
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<PurchaseInvoiceItem>) => (
          <Chip
            label={p.value as string}
            size="small"
            color={STATUS_COLORS[p.value as PurchaseInvoiceStatus]}
          />
        ),
      },
      {
        headerName: '',
        maxWidth: 150,
        cellRenderer: (p: ICellRendererParams<PurchaseInvoiceItem>) => {
          const invoice = p.data;
          if (!invoice) return null;
          return (
            <>
              <Tooltip title="View lines">
                <IconButton size="small" onClick={() => setViewingId(invoice.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip
                title={invoice.status === 'DRAFT' ? 'Edit draft' : 'Only drafts can be edited'}
              >
                <span>
                  <IconButton
                    size="small"
                    disabled={invoice.status !== 'DRAFT'}
                    onClick={() => {
                      setEditing(invoice);
                      setCreateOpen(true);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={invoice.status === 'DRAFT' ? 'Post invoice' : 'Already posted'}>
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={invoice.status !== 'DRAFT'}
                    onClick={() => setPosting(invoice)}
                  >
                    <PublishIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          );
        },
      },
    ],
    [],
  );

  const rateColumns = useMemo<ColDef<SupplierRateItem>[]>(
    () => [
      {
        field: 'effectiveOn',
        headerName: 'Date',
        minWidth: 130,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'sku', headerName: 'SKU', minWidth: 150 },
      { field: 'productName', headerName: 'Product', minWidth: 190 },
      { field: 'supplierName', headerName: 'Supplier', minWidth: 170 },
      {
        field: 'rate',
        headerName: 'Rate ₹',
        maxWidth: 130,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'landingCost',
        headerName: 'Landing ₹',
        maxWidth: 140,
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => money(p.value as number),
      },
      { field: 'invoiceNumber', headerName: 'Invoice', minWidth: 150 },
    ],
    [],
  );

  return (
    <PageContainer
      title="Purchase invoices"
      subtitle="Posting an invoice records the supplier rate and refreshes landing costs."
      actions={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing(null);
            setCreateOpen(true);
          }}
        >
          New invoice
        </Button>
      }
    >
      <Stack spacing={1}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            select
            label="Supplier"
            size="small"
            fullWidth={false}
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 200 }}
          >
            <MenuItem value="">All suppliers</MenuItem>
            {(suppliers.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
          {tab === 0 && (
            <TextField
              select
              label="Branch"
              size="small"
              fullWidth={false}
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
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
          )}
        </Stack>

        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} sx={{ minHeight: 36 }}>
          <Tab label="Invoices" sx={{ minHeight: 36, py: 0 }} />
          <Tab
            label="Rate history"
            icon={<HistoryIcon fontSize="small" />}
            iconPosition="start"
            sx={{ minHeight: 36, py: 0 }}
          />
        </Tabs>

        {tab === 0 ? (
          <DataTable
            rows={data?.items ?? []}
            columns={invoiceColumns}
            meta={data?.meta}
            pagination={pagination}
            loading={isFetching}
            searchPlaceholder="Search by invoice, supplier bill or supplier…"
            height={580}
          />
        ) : (
          <DataTable
            rows={rates.data?.items ?? []}
            columns={rateColumns}
            meta={rates.data?.meta}
            pagination={pagination}
            loading={rates.isFetching}
            searchPlaceholder="Search rate history…"
            height={580}
          />
        )}
      </Stack>

      <PurchaseInvoiceDialog
        open={createOpen}
        editing={editing ? (editDetail.data ?? editing) : null}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={(invoiceNumber) => {
          setCreateOpen(false);
          setEditing(null);
          setNotice(`${invoiceNumber} saved as draft — post it to update landing costs.`);
        }}
      />

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.invoiceNumber ?? 'Purchase invoice'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.supplierName} · bill {detail.data.supplierInvoiceNo} ·{' '}
                {new Date(detail.data.invoiceDate).toLocaleDateString()}
                {detail.data.grnNumber ? ` · against ${detail.data.grnNumber}` : ''}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Boxes</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">GST %</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Landing/box</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.data.lines ?? []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')}
                      </TableCell>
                      <TableCell align="right">{money(line.rate)}</TableCell>
                      <TableCell align="right">{line.gstRate}</TableCell>
                      <TableCell align="right">{money(line.lineTotal)}</TableCell>
                      <TableCell align="right">{money(line.impliedLandingCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Stack direction="row" spacing={3} justifyContent="flex-end">
                <Typography variant="body2">
                  Transport: {money(detail.data.transportCharge)}
                </Typography>
                <Typography variant="body2">
                  Other: {money(detail.data.additionalCharge)}
                </Typography>
                <Typography variant="body2">Sub total: {money(detail.data.subTotal)}</Typography>
                <Typography variant="body2">GST: {money(detail.data.gstAmount)}</Typography>
                <Typography variant="subtitle2">
                  Total: {money(detail.data.grandTotal)}
                </Typography>
              </Stack>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={posting !== null}
        title="Post invoice"
        message={`Post ${posting?.invoiceNumber}? This records supplier rates and updates each product's purchase rate and landing cost.`}
        confirmLabel="Post"
        onCancel={() => setPosting(null)}
        onConfirm={async () => {
          if (!posting) return;
          try {
            await postInvoice.mutateAsync({ id: posting.id, version: posting.version });
            setNotice(`${posting.invoiceNumber} posted — landing costs refreshed.`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to post');
          } finally {
            setPosting(null);
          }
        }}
      />
    </PageContainer>
  );
}
