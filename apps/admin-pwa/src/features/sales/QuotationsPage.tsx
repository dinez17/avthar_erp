import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';
import ForwardToInboxIcon from '@mui/icons-material/ForwardToInbox';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Button,
  Chip,
  Dialog,
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
import { formatBoxPieces } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import type { QuotationItem, QuotationStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useCustomers, useQuotation, useQuotations, useQuotationStatus } from './api';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS: Record<
  QuotationStatus,
  'default' | 'info' | 'success' | 'error' | 'warning'
> = {
  DRAFT: 'default',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'error',
  EXPIRED: 'warning',
  CONVERTED: 'success',
};

const STATUSES: QuotationStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
];

/** Paper the counter prints on; picked from the printer icon and passed to the print view. */
const PAPER_SIZES = [
  { value: 'A4', label: 'A4' },
  { value: '80mm', label: '80 mm roll' },
  { value: '58mm', label: '58 mm roll' },
] as const;

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Quotations: draft, send to the customer, then accept or reject. */
export function QuotationsPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const customers = useCustomers();
  const branches = useBranches();
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<QuotationStatus | ''>('');

  const { data, isFetching } = useQuotations(pagination.query, {
    customerId: customerId || undefined,
    branchId: branchId || undefined,
    status: status || undefined,
  });
  const changeStatus = useQuotationStatus();

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [printMenu, setPrintMenu] = useState<{ anchor: HTMLElement; id: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useQuotation(viewingId);

  const runStatus = async (
    quotation: QuotationItem,
    next: 'SENT' | 'ACCEPTED' | 'REJECTED',
  ): Promise<void> => {
    setError(null);
    try {
      const updated = await changeStatus.mutateAsync({
        id: quotation.id,
        version: quotation.version,
        status: next,
      });
      // Accepting a walk-in quote creates the customer, which is worth saying: the clerk
      // asked to accept a quote and got a new master record as well.
      const registered =
        next === 'ACCEPTED' && !quotation.customerId && updated.customerId
          ? ` ${updated.customerName} is now in the customer master.`
          : '';
      setNotice(`${quotation.quotationNumber} marked ${next.toLowerCase()}.${registered}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  };

  const columns = useMemo<ColDef<QuotationItem>[]>(
    () => [
      { field: 'quotationNumber', headerName: 'Quote no', minWidth: 150 },
      {
        field: 'quotationDate',
        headerName: 'Date',
        minWidth: 120,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'customerName', headerName: 'Customer', minWidth: 190 },
      { field: 'customerMobile', headerName: 'Mobile', maxWidth: 130 },
      { field: 'salesmanName', headerName: 'Salesman', minWidth: 140 },
      { field: 'branchName', headerName: 'Branch', minWidth: 140 },
      {
        field: 'validUntil',
        headerName: 'Valid until',
        minWidth: 130,
        cellRenderer: (p: ICellRendererParams<QuotationItem>) => {
          if (!p.value) return '—';
          const text = new Date(p.value as string).toLocaleDateString();
          return p.data?.isExpired ? (
            <Chip label={`${text} · expired`} size="small" color="warning" />
          ) : (
            text
          );
        },
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
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<QuotationItem>) => (
          <Chip
            label={p.value as string}
            size="small"
            color={STATUS_COLORS[p.value as QuotationStatus]}
          />
        ),
      },
      {
        headerName: '',
        minWidth: 230,
        cellRenderer: (p: ICellRendererParams<QuotationItem>) => {
          const q = p.data;
          if (!q) return null;
          return (
            <>
              <Tooltip title="View lines">
                <IconButton size="small" onClick={() => setViewingId(q.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Print">
                <IconButton
                  size="small"
                  onClick={(event) => setPrintMenu({ anchor: event.currentTarget, id: q.id })}
                >
                  <PrintIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={q.status === 'DRAFT' ? 'Edit draft' : 'Only drafts can be edited'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={q.status !== 'DRAFT'}
                    onClick={() => navigate(`/quotations/${q.id}/edit`)}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={q.status === 'DRAFT' ? 'Mark as sent to customer' : 'Already sent'}>
                <span>
                  <IconButton
                    size="small"
                    color="info"
                    disabled={q.status !== 'DRAFT'}
                    onClick={() => void runStatus(q, 'SENT')}
                  >
                    <ForwardToInboxIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={q.status === 'SENT' ? 'Customer accepted' : 'Send it first'}>
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={q.status !== 'SENT'}
                    onClick={() => void runStatus(q, 'ACCEPTED')}
                  >
                    <CheckIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Customer rejected">
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={q.status !== 'DRAFT' && q.status !== 'SENT'}
                    onClick={() => void runStatus(q, 'REJECTED')}
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
      title="Quotations"
      subtitle="Quote customers using branch selling prices; accepted quotes become sales orders."
      actions={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/quotations/new')}
        >
          New quotation
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
              setStatus(e.target.value as QuotationStatus | '');
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
          searchPlaceholder="Search by quote number or customer…"
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
              if (target) navigate(`/quotations/${target.id}/print?paper=${size.value}`);
            }}
          >
            {size.label}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.quotationNumber ?? 'Quotation'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.customerName} · {detail.data.branchName} ·{' '}
                {new Date(detail.data.quotationDate).toLocaleDateString()}
                {detail.data.validUntil
                  ? ` · valid until ${new Date(detail.data.validUntil).toLocaleDateString()}`
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
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Disc %</TableCell>
                    <TableCell align="right">Net rate</TableCell>
                    <TableCell align="right">GST %</TableCell>
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
                      <TableCell align="right">{money(line.rate)}</TableCell>
                      <TableCell align="right">{line.discountPct}</TableCell>
                      <TableCell align="right">{money(line.netRate)}</TableCell>
                      <TableCell align="right">{line.gstRate}</TableCell>
                      <TableCell align="right">{money(line.lineTotal)}</TableCell>
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
    </PageContainer>
  );
}
