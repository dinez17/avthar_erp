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
import { useEffect, useMemo, useState } from 'react';
import { formatBoxPieces, toDateInput } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import type { QuotationItem, QuotationStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ListExportButtons, type ExportColumn } from '../../components/ListExportButtons';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useAuth } from '../../auth/AuthProvider';
import {
  useCustomers,
  useQuotation,
  useQuotations,
  useQuotationStatus,
  useSalesmen,
} from './api';
import { useNavigate } from 'react-router-dom';
import { useSessionBranchId } from '../../lib/session-branch';

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
  { value: 'A5', label: 'A5 estimate' },
  { value: '80mm', label: '80 mm roll' },
  { value: '58mm', label: '58 mm roll' },
] as const;

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const quotationExportColumns: ExportColumn<QuotationItem>[] = [
  { header: 'Quote no', value: (row) => row.quotationNumber, width: 125 },
  { header: 'Date', value: (row) => new Date(row.quotationDate).toLocaleDateString('en-IN'), width: 80 },
  { header: 'Customer', value: (row) => row.customerName, width: 180 },
  { header: 'Mobile', value: (row) => row.customerMobile, width: 100 },
  { header: 'Salesman', value: (row) => row.salesmanName, width: 130 },
  { header: 'Total', value: (row) => row.grandTotal, width: 90 },
  { header: 'Status', value: (row) => row.status, width: 90 },
];

/** Quotations: draft, send to the customer, then accept or reject. */
export function QuotationsPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const customers = useCustomers();
  const branches = useBranches();
  const { user } = useAuth();
  const canChangeBranch = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN'));
  const availableBranches = (branches.data ?? []).filter((branch) => canChangeBranch || user?.branchIds.includes(branch.id));
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useSessionBranchId();
  const [salesmanUserId, setSalesmanUserId] = useState('');
  const salesmen = useSalesmen(branchId || undefined);
  // ADMIN and SUPER_ADMIN keep unrestricted quotation access even when another one
  // of their assigned roles was accidentally marked as a sales role.
  const isSalesUser = Boolean(
    !canChangeBranch && user && salesmen.data?.some((salesman) => salesman.id === user.id),
  );
  useEffect(() => {
    if (!canChangeBranch && user?.branchIds.length) {
      setBranchId((current) => user.branchIds.includes(current) ? current : user.branchIds[0]!);
    }
  }, [canChangeBranch, user?.branchIds]);
  useEffect(() => {
    if (isSalesUser && user) {
      setSalesmanUserId(user.id);
      return;
    }
    if (
      salesmanUserId &&
      salesmen.isSuccess &&
      !salesmen.data.some((salesman) => salesman.id === salesmanUserId)
    ) {
      setSalesmanUserId('');
    }
  }, [isSalesUser, salesmanUserId, salesmen.data, salesmen.isSuccess, user]);
  const [status, setStatus] = useState<QuotationStatus | ''>('');
  const [fromDate, setFromDate] = useState(() => toDateInput(new Date()));
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));

  const { data, isFetching } = useQuotations(pagination.query, {
    fromDate,
    toDate,
    customerId: customerId || undefined,
    branchId: branchId || undefined,
    salesmanUserId: salesmanUserId || undefined,
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
              <Tooltip title={q.status === 'DRAFT' || q.status === 'SENT' ? 'Edit quotation' : 'Cannot edit after customer acceptance'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={q.status !== 'DRAFT' && q.status !== 'SENT'}
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
            label="From date"
            type="date"
            size="small"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); pagination.setPage(1); }}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: toDate || undefined }}
            sx={{ width: { xs: '100%', sm: 165 } }}
          />
          <TextField
            label="To date"
            type="date"
            size="small"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); pagination.setPage(1); }}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: fromDate || undefined }}
            sx={{ width: { xs: '100%', sm: 165 } }}
          />
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
            label="Salesman"
            size="small"
            fullWidth={false}
            value={salesmanUserId}
            disabled={isSalesUser}
            onChange={(e) => {
              setSalesmanUserId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 190 }}
          >
            {!isSalesUser && <MenuItem value="">All salesmen</MenuItem>}
            {(salesmen.data ?? []).map((salesman) => (
              <MenuItem key={salesman.id} value={salesman.id}>
                {salesman.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Branch"
            size="small"
            fullWidth={false}
            value={branchId}
            disabled={!canChangeBranch && availableBranches.length === 0}
            onChange={(e) => {
              setBranchId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 180 }}
          >
            {canChangeBranch && <MenuItem value="">All branches</MenuItem>}
            {availableBranches.map((b) => (
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
          <ListExportButtons<QuotationItem>
            path="/quotations"
            params={{
              search: pagination.query.search,
              customerId: customerId || undefined,
              branchId: branchId || undefined,
              salesmanUserId: salesmanUserId || undefined,
              status: status || undefined,
              fromDate: fromDate || undefined,
              toDate: toDate || undefined,
            }}
            columns={quotationExportColumns}
            title="Quotations"
            filename="quotations"
            onError={setError}
          />
        </Stack>

        <DataTable
          exportable={false}
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by quote number or customer…"
          height={580}
          gridOptions={{ enableCellTextSelection: true, ensureDomOrder: true }}
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
