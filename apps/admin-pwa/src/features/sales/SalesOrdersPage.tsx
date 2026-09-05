import CallSplitIcon from '@mui/icons-material/CallSplit';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import InventoryIcon from '@mui/icons-material/Inventory';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
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
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { formatBoxPieces } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import { OrderSplitPanel } from './OrderSplitPanel';
import type { SalesOrderItem, SalesOrderStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useCustomers, useQuotations } from './api';
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useConvertQuotation,
  useDeleteSalesOrder,
  useReservations,
  useSalesOrder,
  useSalesOrders,
} from './orders-api';
import { SalesInvoiceDialog } from './SalesInvoiceDialog';

const STATUS_COLORS: Record<SalesOrderStatus, 'default' | 'info' | 'success' | 'error'> = {
  DRAFT: 'default',
  CONFIRMED: 'info',
  PARTIALLY_INVOICED: 'info',
  INVOICED: 'success',
  CANCELLED: 'error',
};

const STATUSES: SalesOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_INVOICED',
  'INVOICED',
  'CANCELLED',
];

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Sales orders: convert an accepted quotation, confirm to reserve stock, and cancel to
 * release it again. Invoicing against these orders follows in the next sprint.
 */
export function SalesOrdersPage(): JSX.Element {
  const pagination = usePagination();
  const customers = useCustomers();
  const branches = useBranches();
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<SalesOrderStatus | ''>('');

  const { data, isFetching } = useSalesOrders(pagination.query, {
    customerId: customerId || undefined,
    branchId: branchId || undefined,
    status: status || undefined,
  });

  // Only accepted quotations can become orders.
  const acceptedQuotations = useQuotations(
    { page: 1, pageSize: 100, sortOrder: 'desc' },
    { status: 'ACCEPTED' },
  );

  const convert = useConvertQuotation();
  const confirmOrder = useConfirmSalesOrder();
  const cancelOrder = useCancelSalesOrder();
  const deleteOrder = useDeleteSalesOrder();

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [reservationsId, setReservationsId] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [quotationId, setQuotationId] = useState('');
  const [convertCustomerId, setConvertCustomerId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [cancelling, setCancelling] = useState<SalesOrderItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleting, setDeleting] = useState<SalesOrderItem | null>(null);
  const [invoicing, setInvoicing] = useState<SalesOrderItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SalesOrderItem | null>(null);
  const [crossBranch, setCrossBranch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detail = useSalesOrder(viewingId);
  const reservations = useReservations(reservationsId);

  // A walk-in quotation has no customer record, so the counter names one at conversion.
  const chosenQuotation = (acceptedQuotations.data?.items ?? []).find(
    (quotation) => quotation.id === quotationId,
  );
  const needsCustomer = Boolean(chosenQuotation && !chosenQuotation.customerId);

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    setError(null);
    try {
      await action();
      setNotice(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const submitConvert = (): void => {
    if (!quotationId) {
      setError('Choose a quotation to convert');
      return;
    }
    if (needsCustomer && !convertCustomerId) {
      setError('This quotation was for a walk-in. Choose the customer to order for.');
      return;
    }
    void run(async () => {
      const order = await convert.mutateAsync({
        quotationId,
        deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
        customerId: convertCustomerId || undefined,
      });
      setConvertOpen(false);
      setQuotationId('');
      setConvertCustomerId('');
      setDeliveryDate('');
      setNotice(`${order.orderNumber} created as a draft.`);
    }, 'Order created');
  };

  const submitCancel = (): void => {
    if (!cancelling) return;
    const order = cancelling;
    void run(async () => {
      await cancelOrder.mutateAsync({
        id: order.id,
        version: order.version,
        reason: cancelReason,
      });
      setCancelling(null);
      setCancelReason('');
    }, `${order.orderNumber} cancelled and its stock released.`);
  };

  const columns = useMemo<ColDef<SalesOrderItem>[]>(
    () => [
      { field: 'orderNumber', headerName: 'Order no', minWidth: 150 },
      {
        field: 'orderDate',
        headerName: 'Date',
        minWidth: 115,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'customerName', headerName: 'Customer', minWidth: 190 },
      { field: 'branchName', headerName: 'Branch', minWidth: 130 },
      { field: 'salesmanName', headerName: 'Salesman', minWidth: 130 },
      { field: 'quotationNumber', headerName: 'From quote', minWidth: 140 },
      {
        field: 'deliveryDate',
        headerName: 'Delivery',
        minWidth: 115,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : '—'),
      },
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
        maxWidth: 180,
        cellRenderer: (p: ICellRendererParams<SalesOrderItem>) => (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip
              label={(p.value as string).replace('_', ' ')}
              size="small"
              color={STATUS_COLORS[p.value as SalesOrderStatus]}
            />
            {p.data?.isSplit && (
              <Tooltip
                title={`Supplied by ${p.data.supplyingBranchIds.length} branches — one invoice each`}
              >
                <Chip
                  icon={<CallSplitIcon />}
                  label={p.data.supplyingBranchIds.length}
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              </Tooltip>
            )}
          </Stack>
        ),
      },
      {
        headerName: '',
        minWidth: 230,
        cellRenderer: (p: ICellRendererParams<SalesOrderItem>) => {
          const order = p.data;
          if (!order) return null;
          const isDraft = order.status === 'DRAFT';
          const holdsStock = order.status === 'CONFIRMED';
          return (
            <>
              <Tooltip title="View lines">
                <IconButton size="small" onClick={() => setViewingId(order.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={holdsStock ? 'Reserved stock' : 'Stock is reserved on confirm'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={order.status === 'DRAFT' || order.status === 'CANCELLED'}
                    onClick={() => setReservationsId(order.id)}
                  >
                    <InventoryIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip
                title={
                  holdsStock || order.status === 'PARTIALLY_INVOICED'
                    ? 'Raise an invoice'
                    : 'Confirm the order first'
                }
              >
                <span>
                  <IconButton
                    size="small"
                    color="primary"
                    disabled={
                      order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_INVOICED'
                    }
                    onClick={() => setInvoicing(order)}
                  >
                    <ReceiptLongIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={isDraft ? 'Confirm and reserve stock' : 'Already confirmed'}>
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={!isDraft}
                    onClick={() => {
                      setConfirming(order);
                      setCrossBranch(order.allowCrossBranch);
                    }}
                  >
                    <CheckCircleIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Cancel and release stock">
                <span>
                  <IconButton
                    size="small"
                    color="warning"
                    disabled={order.status !== 'DRAFT' && order.status !== 'CONFIRMED'}
                    onClick={() => {
                      setCancelling(order);
                      setCancelReason('');
                    }}
                  >
                    <CancelIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={isDraft ? 'Delete draft' : 'Only drafts can be deleted'}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={!isDraft}
                    onClick={() => setDeleting(order)}
                  >
                    <DeleteIcon fontSize="small" />
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
      title="Sales orders"
      subtitle="Confirming an order reserves stock for the customer; cancelling releases it."
      actions={
        <Button
          variant="contained"
          startIcon={<PlaylistAddCheckIcon />}
          onClick={() => setConvertOpen(true)}
        >
          Convert quotation
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
            label="Customer"
            size="small"
            fullWidth={false}
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 200 }}
          >
            <MenuItem value="">All customers</MenuItem>
            {(customers.data ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
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
              setStatus(e.target.value as SalesOrderStatus | '');
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
          searchPlaceholder="Search by order number or customer…"
          height={580}
        />
      </Stack>

      <Dialog open={convertOpen} onClose={() => setConvertOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Convert an accepted quotation</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField
              select
              label="Quotation *"
              size="small"
              value={quotationId}
              onChange={(e) => {
                setQuotationId(e.target.value);
                const picked = (acceptedQuotations.data?.items ?? []).find(
                  (quotation) => quotation.id === e.target.value,
                );
                // Offer the customer whose name matches what was quoted at the counter.
                const match = (customers.data ?? []).find(
                  (customer) =>
                    customer.name.trim().toLowerCase() ===
                    (picked?.customerName ?? '').trim().toLowerCase(),
                );
                setConvertCustomerId(picked?.customerId ?? match?.id ?? '');
              }}
              helperText="Accepted quotations only"
            >
              {(acceptedQuotations.data?.items ?? []).map((quotation) => (
                <MenuItem key={quotation.id} value={quotation.id}>
                  {quotation.quotationNumber} · {quotation.customerName} ·{' '}
                  {money(quotation.grandTotal)}
                </MenuItem>
              ))}
            </TextField>
            {needsCustomer && (
              <TextField
                select
                label="Customer *"
                size="small"
                value={convertCustomerId}
                onChange={(e) => setConvertCustomerId(e.target.value)}
                helperText="This was quoted to a walk-in; pick the customer master record to bill"
              >
                {(customers.data ?? []).map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.phone ? ` · ${customer.phone}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="Promised delivery date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConvertOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitConvert} disabled={convert.isPending}>
            {convert.isPending ? 'Converting…' : 'Create order'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.orderNumber ?? 'Sales order'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.customerName} · {detail.data.branchName} ·{' '}
                {new Date(detail.data.orderDate).toLocaleDateString()}
                {detail.data.quotationNumber ? ` · from ${detail.data.quotationNumber}` : ''}
              </Typography>
              {detail.data.cancelReason && (
                <Alert severity="warning">Cancelled: {detail.data.cancelReason}</Alert>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Ordered</TableCell>
                    <TableCell align="right">Reserved</TableCell>
                    <TableCell align="right">Pending</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.data.lines ?? []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(
                          line.qtyBoxes,
                          line.piecesPerBox,
                          line.baseUom === 'PIECE',
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(
                          line.reservedQtyBoxes,
                          line.piecesPerBox,
                          line.baseUom === 'PIECE',
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(
                          line.pendingQtyBoxes,
                          line.piecesPerBox,
                          line.baseUom === 'PIECE',
                        )}
                      </TableCell>
                      <TableCell align="right">{money(line.rate)}</TableCell>
                      <TableCell align="right">{money(line.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Stack direction="row" justifyContent="flex-end" spacing={3}>
                <Typography variant="body2">Sub total {money(detail.data.subTotal)}</Typography>
                <Typography variant="body2">GST {money(detail.data.gstAmount)}</Typography>
                <Typography variant="subtitle2">
                  Total {money(detail.data.grandTotal)}
                </Typography>
              </Stack>

              {detail.data.status !== 'DRAFT' && detail.data.status !== 'CANCELLED' && (
                <>
                  <Divider />
                  <OrderSplitPanel
                    salesOrderId={detail.data.id}
                    onInvoiced={(message) => {
                      setViewingId(null);
                      setNotice(message);
                    }}
                  />
                </>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={reservationsId !== null}
        onClose={() => setReservationsId(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reserved stock</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>Godown</TableCell>
                <TableCell>Batch</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(reservations.data ?? []).map((reservation) => (
                <TableRow key={reservation.id}>
                  <TableCell>{reservation.productName}</TableCell>
                  <TableCell>{reservation.godownName}</TableCell>
                  <TableCell>{reservation.batchNo ?? '—'}</TableCell>
                  <TableCell align="right">
                    {formatBoxPieces(
                      reservation.qtyBoxes,
                      reservation.piecesPerBox,
                      reservation.baseUom === 'PIECE',
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={reservation.status}
                      size="small"
                      color={reservation.status === 'ACTIVE' ? 'info' : 'default'}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {(reservations.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      Nothing is reserved for this order.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirm {confirming?.orderNumber}?</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            <Typography variant="body2">
              Stock is reserved for the customer now, and stays reserved until the order is
              invoiced or cancelled.
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={crossBranch}
                  onChange={(e) => setCrossBranch(e.target.checked)}
                />
              }
              label="Let other branches supply what this one cannot"
            />
            {crossBranch && (
              <Alert severity="warning">
                Each supplying branch will invoice its own share under its own GSTIN, so this
                order can become more than one invoice — and the tax on them may differ.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirming(null)}>
            Not yet
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={confirmOrder.isPending}
            onClick={() => {
              const order = confirming!;
              setConfirming(null);
              void run(
                () =>
                  confirmOrder.mutateAsync({
                    id: order.id,
                    version: order.version,
                    allowCrossBranch: crossBranch,
                  }),
                `${order.orderNumber} confirmed and stock reserved.`,
              );
            }}
          >
            Confirm and reserve
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelling !== null} onClose={() => setCancelling(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel {cancelling?.orderNumber}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Any stock held for this order is released back to free stock.
            </Typography>
            <TextField
              label="Reason *"
              size="small"
              multiline
              minRows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setCancelling(null)}>
            Keep order
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={submitCancel}
            disabled={cancelReason.trim().length < 3 || cancelOrder.isPending}
          >
            Cancel order
          </Button>
        </DialogActions>
      </Dialog>

      <SalesInvoiceDialog
        open={invoicing !== null}
        order={invoicing}
        onClose={() => setInvoicing(null)}
        onCreated={(message) => {
          setInvoicing(null);
          setNotice(message);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete draft order"
        message={`Delete ${deleting?.orderNumber}? Confirmed orders must be cancelled instead.`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const order = deleting;
          setDeleting(null);
          if (order) {
            void run(() => deleteOrder.mutateAsync(order.id), `${order.orderNumber} deleted.`);
          }
        }}
      />
    </PageContainer>
  );
}
