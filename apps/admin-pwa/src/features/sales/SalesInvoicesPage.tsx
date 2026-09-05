import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import PrintIcon from '@mui/icons-material/Print';
import PublishIcon from '@mui/icons-material/Publish';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
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
  Button,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBoxPieces } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { SalesInvoiceItem, SalesInvoiceStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useCustomers } from './api';
import {
  useCancelSalesInvoice,
  useDeleteSalesInvoice,
  usePostSalesInvoice,
  useSalesInvoice,
  useSalesInvoices,
} from './invoices-api';

const STATUS_COLORS: Record<SalesInvoiceStatus, 'default' | 'success' | 'error'> = {
  DRAFT: 'default',
  POSTED: 'success',
  CANCELLED: 'error',
};

const STATUSES: SalesInvoiceStatus[] = ['DRAFT', 'POSTED', 'CANCELLED'];

/** Paper the counter prints on; picked from the printer icon and passed to the print view. */
const PAPER_SIZES = [
  { value: 'A4', label: 'A4' },
  { value: '80mm', label: '80 mm roll' },
  { value: '58mm', label: '58 mm roll' },
] as const;

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Sales invoices: the document that takes stock out and puts the value on the customer's
 * account. Drafts can be edited or deleted; posted invoices can only be cancelled.
 */
export function SalesInvoicesPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const customers = useCustomers();
  const branches = useBranches();
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<SalesInvoiceStatus | ''>('');

  const { data, isFetching } = useSalesInvoices(pagination.query, {
    customerId: customerId || undefined,
    branchId: branchId || undefined,
    status: status || undefined,
  });

  const postInvoice = usePostSalesInvoice();
  const cancelInvoice = useCancelSalesInvoice();
  const deleteInvoice = useDeleteSalesInvoice();

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [printMenu, setPrintMenu] = useState<{ anchor: HTMLElement; id: string } | null>(null);
  const [cancelling, setCancelling] = useState<SalesInvoiceItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleting, setDeleting] = useState<SalesInvoiceItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useSalesInvoice(viewingId);

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
    const invoice = cancelling;
    void run(async () => {
      await cancelInvoice.mutateAsync({
        id: invoice.id,
        version: invoice.version,
        reason: cancelReason,
      });
      setCancelling(null);
      setCancelReason('');
    }, `${invoice.invoiceNumber} cancelled and the stock returned.`);
  };

  const columns = useMemo<ColDef<SalesInvoiceItem>[]>(
    () => [
      { field: 'invoiceNumber', headerName: 'Invoice no', minWidth: 150 },
      {
        field: 'invoiceDate',
        headerName: 'Date',
        minWidth: 115,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'customerName', headerName: 'Customer', minWidth: 190 },
      { field: 'branchName', headerName: 'Branch', minWidth: 130 },
      { field: 'orderNumber', headerName: 'From order', minWidth: 140 },
      {
        field: 'dueDate',
        headerName: 'Due',
        minWidth: 110,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : '—'),
      },
      {
        field: 'gstAmount',
        headerName: 'GST',
        maxWidth: 130,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'grandTotal',
        headerName: 'Total',
        maxWidth: 150,
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'balanceAmount',
        headerName: 'Balance',
        maxWidth: 140,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'status',
        headerName: 'Status',
        maxWidth: 130,
        cellRenderer: (p: ICellRendererParams<SalesInvoiceItem>) => (
          <Chip
            label={p.value as string}
            size="small"
            color={STATUS_COLORS[p.value as SalesInvoiceStatus]}
          />
        ),
      },
      {
        headerName: '',
        minWidth: 210,
        cellRenderer: (p: ICellRendererParams<SalesInvoiceItem>) => {
          const invoice = p.data;
          if (!invoice) return null;
          const isDraft = invoice.status === 'DRAFT';
          return (
            <>
              <Tooltip title="View lines">
                <IconButton size="small" onClick={() => setViewingId(invoice.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Print tax invoice">
                <IconButton
                  size="small"
                  onClick={(event) => setPrintMenu({ anchor: event.currentTarget, id: invoice.id })}
                >
                  <PrintIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={isDraft ? 'Post: takes the stock out' : 'Already posted'}>
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={!isDraft}
                    onClick={() =>
                      void run(
                        () =>
                          postInvoice.mutateAsync({ id: invoice.id, version: invoice.version }),
                        `${invoice.invoiceNumber} posted; stock issued.`,
                      )
                    }
                  >
                    <PublishIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Cancel and return the stock">
                <span>
                  <IconButton
                    size="small"
                    color="warning"
                    disabled={invoice.status === 'CANCELLED'}
                    onClick={() => {
                      setCancelling(invoice);
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
                    onClick={() => setDeleting(invoice)}
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
      title="Sales invoices"
      subtitle="Raise invoices from the Sales orders page; posting one issues the stock."
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
              setStatus(e.target.value as SalesInvoiceStatus | '');
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
          searchPlaceholder="Search by invoice number or customer…"
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
              if (target) navigate(`/sales-invoices/${target.id}/print?paper=${size.value}`);
            }}
          >
            {size.label}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.invoiceNumber ?? 'Sales invoice'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.customerName} · {detail.data.branchName} ·{' '}
                {new Date(detail.data.invoiceDate).toLocaleDateString()}
                {detail.data.orderNumber ? ` · from ${detail.data.orderNumber}` : ''}
                {detail.data.customerGstin ? ` · GSTIN ${detail.data.customerGstin}` : ''}
              </Typography>
              {detail.data.cancelReason && (
                <Alert severity="warning">Cancelled: {detail.data.cancelReason}</Alert>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Item</TableCell>
                    <TableCell>Godown</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">GST %</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.data.lines ?? []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        {line.productName}
                        {line.batchNo && (
                          <Typography variant="caption" color="text.secondary">
                            {' '}
                            · {line.batchNo}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{line.godownName}</TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(
                          line.qtyBoxes,
                          line.piecesPerBox,
                          line.baseUom === 'PIECE',
                        )}
                      </TableCell>
                      <TableCell align="right">{money(line.rate)}</TableCell>
                      <TableCell align="right">{line.gstRate}</TableCell>
                      <TableCell align="right">{money(line.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Stack direction="row" justifyContent="flex-end" spacing={3}>
                <Typography variant="body2">Sub total {money(detail.data.subTotal)}</Typography>
                {detail.data.isInterState ? (
                  <Typography variant="body2">IGST {money(detail.data.igstAmount)}</Typography>
                ) : (
                  <>
                    <Typography variant="body2">CGST {money(detail.data.cgstAmount)}</Typography>
                    <Typography variant="body2">SGST {money(detail.data.sgstAmount)}</Typography>
                  </>
                )}
                <Typography variant="subtitle2">
                  Total {money(detail.data.grandTotal)}
                </Typography>
              </Stack>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Cancel {cancelling?.invoiceNumber}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              A posted invoice puts its stock back into the godown it left from, and the order is
              re-opened for that quantity.
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
            Keep invoice
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={submitCancel}
            disabled={cancelReason.trim().length < 3 || cancelInvoice.isPending}
          >
            Cancel invoice
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete draft invoice"
        message={`Delete ${deleting?.invoiceNumber}? Posted invoices must be cancelled instead.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const invoice = deleting;
          setDeleting(null);
          if (invoice) {
            void run(
              () => deleteInvoice.mutateAsync(invoice.id),
              `${invoice.invoiceNumber} deleted.`,
            );
          }
        }}
      />
    </PageContainer>
  );
}
