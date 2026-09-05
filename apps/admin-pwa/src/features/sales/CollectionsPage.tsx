import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import PrintIcon from '@mui/icons-material/Print';
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
  Menu,
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
import { useNavigate } from 'react-router-dom';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { CustomerReceiptItem, ReceiptStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useCustomers } from './api';
import { ReceiptDialog } from './ReceiptDialog';
import {
  useCancelReceipt,
  useDeleteReceipt,
  usePostReceipt,
  useReceipt,
  useReceipts,
} from './receipts-api';

const STATUS_COLORS: Record<ReceiptStatus, 'default' | 'success' | 'error'> = {
  DRAFT: 'default',
  POSTED: 'success',
  CANCELLED: 'error',
};

const STATUSES: ReceiptStatus[] = ['DRAFT', 'POSTED', 'CANCELLED'];

/** Paper the counter prints on; picked from the printer icon and passed to the print view. */
const PAPER_SIZES = [
  { value: '80mm', label: '80 mm roll' },
  { value: '58mm', label: '58 mm roll' },
  { value: 'A4', label: 'A4' },
] as const;

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Collections: money received from customers and the invoices it settles. */
export function CollectionsPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const customers = useCustomers();
  const branches = useBranches();
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<ReceiptStatus | ''>('');

  const { data, isFetching } = useReceipts(pagination.query, {
    customerId: customerId || undefined,
    branchId: branchId || undefined,
    status: status || undefined,
  });

  const postReceipt = usePostReceipt();
  const cancelReceipt = useCancelReceipt();
  const deleteReceipt = useDeleteReceipt();

  const [entryOpen, setEntryOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [printMenu, setPrintMenu] = useState<{ anchor: HTMLElement; id: string } | null>(null);
  const [cancelling, setCancelling] = useState<CustomerReceiptItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleting, setDeleting] = useState<CustomerReceiptItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useReceipt(viewingId);

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    setError(null);
    try {
      await action();
      setNotice(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const submitCancel = (): void => {
    if (!cancelling) return;
    const receipt = cancelling;
    void run(async () => {
      await cancelReceipt.mutateAsync({
        id: receipt.id,
        version: receipt.version,
        reason: cancelReason,
      });
      setCancelling(null);
      setCancelReason('');
    }, `${receipt.receiptNumber} cancelled; its invoices are outstanding again.`);
  };

  const columns = useMemo<ColDef<CustomerReceiptItem>[]>(
    () => [
      { field: 'receiptNumber', headerName: 'Receipt no', minWidth: 150 },
      {
        field: 'receiptDate',
        headerName: 'Date',
        minWidth: 115,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'customerName', headerName: 'Customer', minWidth: 190 },
      { field: 'branchName', headerName: 'Branch', minWidth: 130 },
      { field: 'modeSummary', headerName: 'Paid by', minWidth: 200 },
      {
        field: 'amount',
        headerName: 'Received',
        maxWidth: 150,
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'allocatedAmount',
        headerName: 'Allocated',
        maxWidth: 140,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'onAccountAmount',
        headerName: 'On account',
        maxWidth: 140,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'status',
        headerName: 'Status',
        maxWidth: 130,
        cellRenderer: (p: ICellRendererParams<CustomerReceiptItem>) => (
          <Chip
            label={p.value as string}
            size="small"
            color={STATUS_COLORS[p.value as ReceiptStatus]}
          />
        ),
      },
      {
        headerName: '',
        minWidth: 210,
        cellRenderer: (p: ICellRendererParams<CustomerReceiptItem>) => {
          const receipt = p.data;
          if (!receipt) return null;
          const isDraft = receipt.status === 'DRAFT';
          return (
            <>
              <Tooltip title="View allocations">
                <IconButton size="small" onClick={() => setViewingId(receipt.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Print receipt">
                <IconButton
                  size="small"
                  onClick={(event) => setPrintMenu({ anchor: event.currentTarget, id: receipt.id })}
                >
                  <PrintIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={isDraft ? 'Post: settles the invoices' : 'Already posted'}>
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={!isDraft}
                    onClick={() =>
                      void run(
                        () =>
                          postReceipt.mutateAsync({ id: receipt.id, version: receipt.version }),
                        `${receipt.receiptNumber} posted; invoices settled.`,
                      )
                    }
                  >
                    <PublishIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Cancel and re-open the invoices">
                <span>
                  <IconButton
                    size="small"
                    color="warning"
                    disabled={receipt.status === 'CANCELLED'}
                    onClick={() => {
                      setCancelling(receipt);
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
                    onClick={() => setDeleting(receipt)}
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
      title="Collections"
      subtitle="Money received from customers; posting a receipt settles the invoices it covers."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEntryOpen(true)}>
          New receipt
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
              setStatus(e.target.value as ReceiptStatus | '');
              pagination.setPage(1);
            }}
            sx={{ width: 160 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
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
          searchPlaceholder="Search by receipt number, reference or customer…"
          height={580}
        />
      </Stack>

      <Menu
        open={printMenu !== null}
        anchorEl={printMenu?.anchor ?? null}
        onClose={() => setPrintMenu(null)}
      >
        {PAPER_SIZES.map((size) => (
          <MenuItem
            key={size.value}
            onClick={() => {
              const target = printMenu;
              setPrintMenu(null);
              if (target) navigate(`/receipts/${target.id}/print?paper=${size.value}`);
            }}
          >
            {size.label}
          </MenuItem>
        ))}
      </Menu>

      <ReceiptDialog
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        onCreated={(receiptNumber) => {
          setEntryOpen(false);
          setNotice(`${receiptNumber} recorded as a draft. Post it to settle the invoices.`);
        }}
      />

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{detail.data?.receiptNumber ?? 'Receipt'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.customerName} · {detail.data.branchName} ·{' '}
                {new Date(detail.data.receiptDate).toLocaleDateString()}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Paid by</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Bank</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.data.payments ?? []).map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{payment.mode}</TableCell>
                      <TableCell>{payment.referenceNo ?? '—'}</TableCell>
                      <TableCell>{payment.bankName ?? '—'}</TableCell>
                      <TableCell align="right">{money(payment.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {detail.data.cancelReason && (
                <Alert severity="warning">Cancelled: {detail.data.cancelReason}</Alert>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Invoice total</TableCell>
                    <TableCell align="right">Settled</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.data.allocations ?? []).map((allocation) => (
                    <TableRow key={allocation.id}>
                      <TableCell>{allocation.invoiceNumber}</TableCell>
                      <TableCell>
                        {new Date(allocation.invoiceDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell align="right">{money(allocation.invoiceTotal)}</TableCell>
                      <TableCell align="right">{money(allocation.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {(detail.data.allocations ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          Nothing allocated; the whole amount is on account.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <Stack direction="row" justifyContent="flex-end" spacing={3}>
                <Typography variant="body2">
                  On account {money(detail.data.onAccountAmount)}
                </Typography>
                <Typography variant="subtitle2">Received {money(detail.data.amount)}</Typography>
              </Stack>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={cancelling !== null} onClose={() => setCancelling(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel {cancelling?.receiptNumber}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              The invoices this receipt settled become outstanding again.
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
            Keep receipt
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={submitCancel}
            disabled={cancelReason.trim().length < 3 || cancelReceipt.isPending}
          >
            Cancel receipt
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete draft receipt"
        message={`Delete ${deleting?.receiptNumber}? Posted receipts must be cancelled instead.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const receipt = deleting;
          setDeleting(null);
          if (receipt) {
            void run(
              () => deleteReceipt.mutateAsync(receipt.id),
              `${receipt.receiptNumber} deleted.`,
            );
          }
        }}
      />
    </PageContainer>
  );
}
