import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import PublishIcon from '@mui/icons-material/Publish';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
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
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { ReceiptStatus, SupplierPaymentItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useSuppliers } from './api';
import { SupplierPaymentDialog } from './SupplierPaymentDialog';
import {
  useCancelSupplierPayment,
  useDeleteSupplierPayment,
  usePostSupplierPayment,
  useSupplierPayment,
  useSupplierPayments,
} from './supplier-payments-api';

const STATUS_COLORS: Record<ReceiptStatus, 'default' | 'success' | 'error'> = {
  DRAFT: 'default',
  POSTED: 'success',
  CANCELLED: 'error',
};

const STATUSES: ReceiptStatus[] = ['DRAFT', 'POSTED', 'CANCELLED'];

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const date = (value: string): string => new Date(value).toLocaleDateString('en-IN');

/**
 * Payments out: money and credit going to suppliers, and the bills they settle.
 *
 * A payment is drafted first and posted second, deliberately — posting is what actually
 * moves money onto bills, and a cheque written by mistake is much easier to delete than
 * to unwind.
 */
export function SupplierPaymentsPage(): JSX.Element {
  const pagination = usePagination();
  const suppliers = useSuppliers();
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<ReceiptStatus | ''>('');

  const { data, isFetching } = useSupplierPayments(pagination.query, {
    supplierId: supplierId || undefined,
    branchId: branchId || undefined,
    status: status || undefined,
  });

  const postPayment = usePostSupplierPayment();
  const cancelPayment = useCancelSupplierPayment();
  const deletePayment = useDeleteSupplierPayment();

  const [entryOpen, setEntryOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<SupplierPaymentItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleting, setDeleting] = useState<SupplierPaymentItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useSupplierPayment(viewingId);

  const run = async (action: () => Promise<SupplierPaymentItem>, done: string): Promise<void> => {
    setError(null);
    try {
      await action();
      setNotice(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That could not be done');
    }
  };

  const columns = useMemo<ColDef<SupplierPaymentItem>[]>(
    () => [
      { field: 'paymentNumber', headerName: 'Payment no', minWidth: 150 },
      {
        field: 'paymentDate',
        headerName: 'Date',
        minWidth: 120,
        valueFormatter: (p) => (p.value ? date(p.value as string) : ''),
      },
      { field: 'supplierName', headerName: 'Supplier', minWidth: 200 },
      { field: 'branchName', headerName: 'Branch', minWidth: 130 },
      { field: 'modeSummary', headerName: 'Paid by', minWidth: 190 },
      {
        field: 'amount',
        headerName: 'Cash',
        maxWidth: 130,
        type: 'rightAligned',
        valueFormatter: (p) => money(Number(p.value ?? 0)),
      },
      {
        field: 'adjustedAmount',
        headerName: 'Credit',
        maxWidth: 120,
        type: 'rightAligned',
        valueFormatter: (p) => (Number(p.value ?? 0) > 0 ? money(Number(p.value)) : '—'),
      },
      {
        field: 'onAccountAmount',
        headerName: 'On account',
        maxWidth: 130,
        type: 'rightAligned',
        valueFormatter: (p) => (Number(p.value ?? 0) > 0 ? money(Number(p.value)) : '—'),
      },
      {
        field: 'status',
        headerName: 'Status',
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<SupplierPaymentItem>) =>
          p.data ? (
            <Chip label={p.data.status} size="small" color={STATUS_COLORS[p.data.status]} />
          ) : null,
      },
      {
        headerName: '',
        minWidth: 150,
        maxWidth: 160,
        cellRenderer: (p: ICellRendererParams<SupplierPaymentItem>) => {
          if (!p.data) return null;
          const payment = p.data;
          return (
            <Stack direction="row" spacing={0}>
              <Tooltip title="Detail">
                <IconButton size="small" onClick={() => setViewingId(payment.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {payment.status === 'DRAFT' && (
                <>
                  <Tooltip title="Post: settle the bills">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() =>
                        void run(
                          () =>
                            postPayment.mutateAsync({
                              id: payment.id,
                              version: payment.version,
                            }),
                          `${payment.paymentNumber} posted.`,
                        )
                      }
                    >
                      <PublishIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete this draft">
                    <IconButton size="small" onClick={() => setDeleting(payment)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              {payment.status === 'POSTED' && (
                <Tooltip title="Cancel: give the money and credit back">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setCancelling(payment);
                      setCancelReason('');
                    }}
                  >
                    <CancelIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          );
        },
      },
    ],
    [postPayment],
  );

  return (
    <PageContainer
      title="Supplier payments"
      subtitle="Money and credit going out, and the bills each payment settles."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEntryOpen(true)}>
          New payment
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

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
            sx={{ width: 220 }}
          >
            <MenuItem value="">All suppliers</MenuItem>
            {(suppliers.data ?? []).map((supplier) => (
              <MenuItem key={supplier.id} value={supplier.id}>
                {supplier.name}
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
            {(branches.data ?? []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
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
              setStatus(e.target.value as ReceiptStatus | '');
              pagination.setPage(1);
            }}
            sx={{ width: 150 }}
          >
            <MenuItem value="">All</MenuItem>
            {STATUSES.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
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
          searchPlaceholder="Search by payment number, cheque reference or supplier…"
          height={600}
        />
      </Stack>

      <SupplierPaymentDialog
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        onCreated={(paymentNumber) => {
          setEntryOpen(false);
          setNotice(`${paymentNumber} saved as a draft. Post it to settle the bills.`);
        }}
      />

      <Dialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Cancel {cancelling?.paymentNumber}?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="body2">
              The bills go back to owing what they did, and any debit notes spent get their
              credit back.
            </Typography>
            <TextField
              label="Reason"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              multiline
              minRows={2}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setCancelling(null)}>
            Keep it
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={!cancelReason.trim() || cancelPayment.isPending}
            onClick={() =>
              void run(
                () =>
                  cancelPayment.mutateAsync({
                    id: cancelling!.id,
                    version: cancelling!.version,
                    reason: cancelReason.trim(),
                  }),
                `${cancelling!.paymentNumber} cancelled.`,
              ).then(() => setCancelling(null))
            }
          >
            Cancel the payment
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.paymentNumber ?? ''}?`}
        message="This draft has not settled anything, so nothing is affected."
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const payment = deleting!;
          setDeleting(null);
          void run(
            async () => {
              await deletePayment.mutateAsync(payment.id);
              return payment;
            },
            `${payment.paymentNumber} deleted.`,
          );
        }}
      />

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.paymentNumber ?? 'Payment'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1.5}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.supplierName} · {detail.data.branchName} ·{' '}
                {date(detail.data.paymentDate)} · {detail.data.modeSummary}
              </Typography>
              {detail.data.cancelReason && (
                <Alert severity="warning">Cancelled: {detail.data.cancelReason}</Alert>
              )}
              {detail.data.remarks && (
                <Typography variant="body2">{detail.data.remarks}</Typography>
              )}

              {(detail.data.tenders ?? []).length > 0 && (
                <>
                  <Typography variant="subtitle2">Paid by</Typography>
                  <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Mode</TableCell>
                        <TableCell>Reference</TableCell>
                        <TableCell>Bank</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(detail.data.tenders ?? []).map((tender) => (
                        <TableRow key={tender.id}>
                          <TableCell>{tender.mode}</TableCell>
                          <TableCell>{tender.referenceNo ?? '—'}</TableCell>
                          <TableCell>{tender.bankName ?? '—'}</TableCell>
                          <TableCell align="right">{money(tender.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}

              {(detail.data.debitNotes ?? []).length > 0 && (
                <>
                  <Typography variant="subtitle2">Debit notes set off</Typography>
                  <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Debit note</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Note total</TableCell>
                        <TableCell align="right">Set off</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(detail.data.debitNotes ?? []).map((note) => (
                        <TableRow key={note.id}>
                          <TableCell>{note.returnNumber}</TableCell>
                          <TableCell>{date(note.returnDate)}</TableCell>
                          <TableCell align="right">{money(note.returnTotal)}</TableCell>
                          <TableCell align="right">{money(note.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}

              <Typography variant="subtitle2">Bills settled</Typography>
              <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Supplier bill</TableCell>
                    <TableCell>Our ref</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Bill total</TableCell>
                    <TableCell align="right">Settled</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.data.allocations ?? []).map((allocation) => (
                    <TableRow key={allocation.id}>
                      <TableCell>{allocation.supplierInvoiceNo}</TableCell>
                      <TableCell>{allocation.invoiceNumber}</TableCell>
                      <TableCell>{date(allocation.invoiceDate)}</TableCell>
                      <TableCell align="right">{money(allocation.invoiceTotal)}</TableCell>
                      <TableCell align="right">{money(allocation.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {(detail.data.allocations ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          Nothing allocated — the whole payment sits as an advance.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <Stack direction="row" spacing={3} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" color="text.secondary">
                  Cash {money(detail.data.amount)}
                </Typography>
                {detail.data.adjustedAmount > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Credit {money(detail.data.adjustedAmount)}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  Allocated {money(detail.data.allocatedAmount)}
                </Typography>
                {detail.data.onAccountAmount > 0 && (
                  <Typography variant="body2" color="warning.main">
                    On account {money(detail.data.onAccountAmount)}
                  </Typography>
                )}
                <Typography variant="body2" fontWeight={700}>
                  Total {money(detail.data.settledAmount)}
                </Typography>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setViewingId(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
