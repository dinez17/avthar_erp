import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
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
  TextField,
  Tooltip,
  Typography,
  Button,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { PurchaseOrderItem, PurchaseOrderStatus } from '@tiles-erp/shared-types';
import { formatBoxPieces } from '@tiles-erp/shared';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { PurchaseOrderDialog } from './PurchaseOrderDialog';
import {
  usePurchaseOrder,
  usePurchaseOrders,
  usePurchaseOrderStatus,
  useSuppliers,
} from './api';

const STATUS_COLORS: Record<PurchaseOrderStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> =
  {
    DRAFT: 'default',
    APPROVED: 'info',
    PARTIALLY_RECEIVED: 'warning',
    RECEIVED: 'success',
    CANCELLED: 'error',
  };

const STATUSES: PurchaseOrderStatus[] = [
  'DRAFT',
  'APPROVED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
];

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Purchase orders: draft, approve, cancel and inspect. */
export function PurchaseOrdersPage(): JSX.Element {
  const pagination = usePagination();
  const suppliers = useSuppliers();
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<PurchaseOrderStatus | ''>('');

  const { data, isFetching } = usePurchaseOrders(pagination.query, {
    supplierId: supplierId || undefined,
    branchId: branchId || undefined,
    status: status || undefined,
  });

  const approve = usePurchaseOrderStatus('approve');
  const cancel = usePurchaseOrderStatus('cancel');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrderItem | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<PurchaseOrderItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = usePurchaseOrder(viewingId);
  const editDetail = usePurchaseOrder(editing?.id ?? null);

  const runApprove = async (order: PurchaseOrderItem): Promise<void> => {
    setError(null);
    try {
      await approve.mutateAsync({ id: order.id, version: order.version });
      setNotice(`${order.poNumber} approved.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to approve');
    }
  };

  const columns = useMemo<ColDef<PurchaseOrderItem>[]>(
    () => [
      { field: 'poNumber', headerName: 'PO number', minWidth: 150 },
      {
        field: 'orderDate',
        headerName: 'Date',
        minWidth: 130,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'supplierName', headerName: 'Supplier', minWidth: 190 },
      { field: 'branchName', headerName: 'Branch', minWidth: 140 },
      { field: 'lineCount', headerName: 'Lines', maxWidth: 90 },
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
        maxWidth: 170,
        cellRenderer: (p: ICellRendererParams<PurchaseOrderItem>) => (
          <Chip
            label={(p.value as string).replace('_', ' ')}
            size="small"
            color={STATUS_COLORS[p.value as PurchaseOrderStatus]}
          />
        ),
      },
      {
        headerName: '',
        maxWidth: 160,
        cellRenderer: (p: ICellRendererParams<PurchaseOrderItem>) => {
          const order = p.data;
          if (!order) return null;
          const isDraft = order.status === 'DRAFT';
          const canCancel = order.status === 'DRAFT' || order.status === 'APPROVED';
          return (
            <>
              <Tooltip title="View lines">
                <IconButton size="small" onClick={() => setViewingId(order.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={isDraft ? 'Edit draft' : 'Only drafts can be edited'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!isDraft}
                    onClick={() => {
                      setEditing(order);
                      setDialogOpen(true);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={isDraft ? 'Approve' : 'Already approved'}>
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={!isDraft}
                    onClick={() => void runApprove(order)}
                  >
                    <CheckCircleIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={canCancel ? 'Cancel' : 'Cannot cancel'}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={!canCancel}
                    onClick={() => setCancelling(order)}
                  >
                    <CloseIcon fontSize="small" />
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

  return (
    <PageContainer
      title="Purchase orders"
      subtitle="Raise orders to suppliers; approved orders are ready for goods receipt."
      actions={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          New order
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
          <TextField
            select
            label="Status"
            size="small"
            fullWidth={false}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PurchaseOrderStatus | '');
              pagination.setPage(1);
            }}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace('_', ' ')}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by PO number or supplier…"
          height={600}
        />
      </Stack>

      <PurchaseOrderDialog
        open={dialogOpen}
        editing={editing ? (editDetail.data ?? editing) : null}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={(poNumber) => {
          setDialogOpen(false);
          setEditing(null);
          setNotice(`${poNumber} saved.`);
        }}
      />

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.poNumber ?? 'Purchase order'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.supplierName} · {detail.data.branchName} ·{' '}
                {new Date(detail.data.orderDate).toLocaleDateString()}
                {detail.data.expectedDate
                  ? ` · expected ${new Date(detail.data.expectedDate).toLocaleDateString()}`
                  : ''}
              </Typography>
              {detail.data.remarks && (
                <Typography variant="body2">{detail.data.remarks}</Typography>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Boxes</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Disc %</TableCell>
                    <TableCell align="right">GST %</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Pending</TableCell>
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
                      <TableCell align="right">{line.discountPct}</TableCell>
                      <TableCell align="right">{line.gstRate}</TableCell>
                      <TableCell align="right">{money(line.lineTotal)}</TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(
                          line.pendingBoxes,
                          line.piecesPerBox,
                          line.baseUom === 'PIECE',
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Stack direction="row" spacing={3} justifyContent="flex-end">
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
        open={cancelling !== null}
        title="Cancel purchase order"
        message={`Cancel ${cancelling?.poNumber}? This cannot be undone.`}
        destructive
        confirmLabel="Cancel order"
        cancelLabel="Keep"
        onCancel={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          try {
            await cancel.mutateAsync({ id: cancelling.id, version: cancelling.version });
            setNotice(`${cancelling.poNumber} cancelled.`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to cancel');
          } finally {
            setCancelling(null);
          }
        }}
      />
    </PageContainer>
  );
}
