import VisibilityIcon from '@mui/icons-material/Visibility';
import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import PaymentsIcon from '@mui/icons-material/Payments';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
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
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePagination } from '@tiles-erp/hooks';
import { formatBoxPieces, toDateInput } from '@tiles-erp/shared';
import type { SalesReturnItem } from '@tiles-erp/shared-types';
import { PageContainer } from '@tiles-erp/ui';
import { useAuth } from '../../auth/AuthProvider';
import { DataTable } from '../../components/DataTable';
import { ListExportButtons, type ExportColumn } from '../../components/ListExportButtons';
import { useBranches } from '../products/branch-prices-api';
import { useLedgerAccounts } from '../accounts/api';
import { useCustomers } from './api';
import { ApiError } from '../../lib/api-client';
import { PERMISSIONS } from '@tiles-erp/config';
import {
  useCreateSalesReturn,
  useSalesInvoice,
  useSalesInvoices,
  useSalesReturn,
  useSalesReturns,
  useRefundSalesReturn,
} from './invoices-api';
import { useSessionBranchId } from '../../lib/session-branch';

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const exportColumns: ExportColumn<SalesReturnItem>[] = [
  { header: 'Return no', value: (row) => row.returnNumber, width: 130 },
  { header: 'Date', value: (row) => new Date(row.returnDate).toLocaleDateString('en-IN'), width: 80 },
  { header: 'Invoice no', value: (row) => row.invoiceNumber, width: 130 },
  { header: 'Customer', value: (row) => row.customerName, width: 180 },
  { header: 'Branch', value: (row) => row.branchName, width: 150 },
  { header: 'Reason', value: (row) => row.reason, width: 180 },
  { header: 'GST', value: (row) => row.gstAmount, width: 80 },
  { header: 'Credit note', value: (row) => row.grandTotal, width: 100 },
];

/** Posted credit notes raised against sales invoices. */
export function SalesReturnsPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.SALES_INVOICE_CANCEL);
  const customers = useCustomers();
  const branches = useBranches();
  const canChangeBranch = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN'));
  const availableBranches = (branches.data ?? []).filter(
    (branch) => canChangeBranch || user?.branchIds.includes(branch.id),
  );
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useSessionBranchId();
  const [fromDate, setFromDate] = useState(toDateInput(new Date()));
  const [toDate, setToDate] = useState(toDateInput(new Date()));
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, { boxes: string; pieces: string }>>({});
  const detail = useSalesReturn(viewingId);
  const invoiceDetail = useSalesInvoice(invoiceId || null);
  const createReturn = useCreateSalesReturn();
  const refundReturn = useRefundSalesReturn();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAccountId, setRefundAccountId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [refundRemarks, setRefundRemarks] = useState('');
  const refundAccounts = useLedgerAccounts({ branchId: detail.data?.branchId });

  const openRefund = (): void => {
    if (!detail.data) return;
    setRefundAmount(String(detail.data.refundableAmount));
    setRefundAccountId('');
    setRefundReference('');
    setRefundRemarks('');
    setRefundOpen(true);
  };

  const submitRefund = async (): Promise<void> => {
    if (!detail.data || !refundAccountId) return;
    setError(null);
    try {
      const result = await refundReturn.mutateAsync({
        id: detail.data.id,
        accountId: refundAccountId,
        amount: Number(refundAmount),
        referenceNo: refundReference || undefined,
        remarks: refundRemarks || undefined,
      });
      setRefundOpen(false);
      setNotice(`${money(Number(refundAmount))} refunded against ${result.returnNumber}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post the customer refund');
    }
  };

  const returnValue = useMemo(() => {
    return (invoiceDetail.data?.lines ?? []).reduce(
      (total, line) => {
        const quantity = returnQty[line.id];
        const qtyBoxes = Number(quantity?.boxes || 0)
          + Number(quantity?.pieces || 0) / line.piecesPerBox;
        if (qtyBoxes <= 0 || line.qtyBoxes <= 0) return total;
        const ratio = qtyBoxes / line.qtyBoxes;
        const subTotal = Math.round(line.lineSubTotal * ratio * 100) / 100;
        const gst = Math.round(line.lineGst * ratio * 100) / 100;
        return {
          subTotal: total.subTotal + subTotal,
          gst: total.gst + gst,
          grandTotal: total.grandTotal + subTotal + gst,
        };
      },
      { subTotal: 0, gst: 0, grandTotal: 0 },
    );
  }, [invoiceDetail.data?.lines, returnQty]);

  useEffect(() => {
    if (!canChangeBranch && user?.branchIds.length) {
      setBranchId((current) => user.branchIds.includes(current) ? current : user.branchIds[0]!);
    }
  }, [canChangeBranch, user?.branchIds]);

  const { data, isFetching } = useSalesReturns(pagination.query, {
    customerId: customerId || undefined,
    branchId: branchId || undefined,
    fromDate,
    toDate,
  });
  const returnableInvoices = useSalesInvoices(
    { page: 1, pageSize: 100, search: invoiceSearch || undefined },
    { branchId: branchId || undefined, customerId: customerId || undefined, status: 'POSTED' },
  );

  const closeCreate = (): void => {
    setCreateOpen(false);
    setInvoiceSearch('');
    setInvoiceId('');
    setReturnReason('');
    setReturnRemarks('');
    setReturnQty({});
  };

  const submitReturn = async (): Promise<void> => {
    if (!invoiceId || !invoiceDetail.data) return;
    const lines = (invoiceDetail.data.lines ?? []).flatMap((line) => {
      const qty = returnQty[line.id];
      const boxes = Number(qty?.boxes || 0);
      const pieces = Number(qty?.pieces || 0);
      return boxes > 0 || pieces > 0 ? [{ salesInvoiceLineId: line.id, boxes, pieces }] : [];
    });
    setError(null);
    try {
      const result = await createReturn.mutateAsync({
        id: invoiceId,
        reason: returnReason,
        remarks: returnRemarks || undefined,
        lines,
      });
      closeCreate();
      setNotice(`${result.returnNumber} posted; stock and customer outstanding updated.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the sales return');
    }
  };

  const columns = useMemo<ColDef<SalesReturnItem>[]>(() => [
    { field: 'returnNumber', headerName: 'Return no', minWidth: 155 },
    {
      field: 'returnDate',
      headerName: 'Date',
      minWidth: 115,
      valueFormatter: (p) => p.value ? new Date(p.value as string).toLocaleDateString('en-IN') : '',
    },
    { field: 'invoiceNumber', headerName: 'Against invoice', minWidth: 160 },
    { field: 'customerName', headerName: 'Customer', minWidth: 190 },
    { field: 'reason', headerName: 'Reason', minWidth: 190 },
    { field: 'lineCount', headerName: 'Items', maxWidth: 95 },
    {
      field: 'grandTotal',
      headerName: 'Credit note',
      maxWidth: 150,
      cellStyle: { fontWeight: 600 },
      valueFormatter: (p) => money(p.value as number),
    },
    {
      field: 'refundableAmount',
      headerName: 'Refund due',
      maxWidth: 145,
      valueFormatter: (p) => money(p.value as number),
    },
    {
      headerName: '',
      minWidth: 100,
      maxWidth: 100,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<SalesReturnItem>) => p.data ? (
        <Stack direction="row" spacing={0}>
          <Tooltip title="View returned items">
            <IconButton size="small" onClick={() => setViewingId(p.data!.id)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Print sales return">
            <IconButton size="small" onClick={() => navigate(`/sales-returns/${p.data!.id}/print`)}>
              <PrintIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ) : null,
    },
  ], [navigate]);

  return (
    <PageContainer
      title="Sales returns"
      subtitle="Credit notes and stock returned against posted sales invoices."
      actions={canCreate ? (
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New sales return
        </Button>
      ) : undefined}
    >
      <Stack spacing={1}>
        {notice && <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert>}
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Autocomplete
            size="small"
            options={customers.data ?? []}
            value={(customers.data ?? []).find((customer) => customer.id === customerId) ?? null}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionLabel={(customer) => `${customer.name}${customer.phone ? ` · ${customer.phone}` : ''}`}
            onChange={(_, customer) => {
              setCustomerId(customer?.id ?? '');
              setInvoiceId('');
              pagination.setPage(1);
            }}
            noOptionsText="No customer found"
            sx={{ width: { xs: '100%', sm: 280 } }}
            renderInput={(params) => (
              <TextField {...params} label="Customer" placeholder="Search name or phone" />
            )}
          />
          <TextField
            select label="Branch" size="small" value={branchId} sx={{ width: 210 }}
            disabled={!canChangeBranch && availableBranches.length === 0}
            onChange={(event) => { setBranchId(event.target.value); pagination.setPage(1); }}
          >
            {canChangeBranch && <MenuItem value="">All branches</MenuItem>}
            {availableBranches.map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="From"
            type="date"
            size="small"
            value={fromDate}
            onChange={(event) => { setFromDate(event.target.value); pagination.setPage(1); }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: '100%', sm: 165 } }}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={toDate}
            onChange={(event) => { setToDate(event.target.value); pagination.setPage(1); }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: '100%', sm: 165 } }}
          />
          <ListExportButtons<SalesReturnItem>
            path="/sales-invoices/returns"
            params={{
              search: pagination.query.search,
              customerId: customerId || undefined,
              branchId: branchId || undefined,
              fromDate,
              toDate,
            }}
            columns={exportColumns}
            title="Sales Returns"
            filename="sales-returns"
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
          searchPlaceholder="Search return, invoice, customer or reason…"
          height={600}
        />
      </Stack>

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="lg" fullWidth>
        <DialogTitle>{detail.data?.returnNumber ?? 'Sales return'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Against {detail.data.invoiceNumber} · {detail.data.customerName} · {detail.data.branchName}
                {' · '}{new Date(detail.data.returnDate).toLocaleDateString('en-IN')}
              </Typography>
              <Typography variant="body2"><strong>Reason:</strong> {detail.data.reason}</Typography>
              {detail.data.remarks && <Typography variant="body2"><strong>Remarks:</strong> {detail.data.remarks}</Typography>}
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>SKU</TableCell><TableCell>Item</TableCell><TableCell>Godown</TableCell>
                  <TableCell align="right">Returned</TableCell><TableCell align="right">Rate</TableCell>
                  <TableCell align="right">GST</TableCell><TableCell align="right">Total</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {(detail.data.lines ?? []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell>{line.productName}{line.sizeMm ? ` · ${line.sizeMm}` : ''}</TableCell>
                      <TableCell>{line.godownName}</TableCell>
                      <TableCell align="right">{formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')}</TableCell>
                      <TableCell align="right">{money(line.rate)}</TableCell>
                      <TableCell align="right">{money(line.lineGst)}</TableCell>
                      <TableCell align="right">{money(line.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Stack direction="row" spacing={3} justifyContent="flex-end">
                <Typography variant="body2">Sub total: {money(detail.data.subTotal)}</Typography>
                <Typography variant="body2">GST: {money(detail.data.gstAmount)}</Typography>
                <Typography variant="subtitle2">Credit note: {money(detail.data.grandTotal)}</Typography>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        {detail.data && <DialogActions>
          <Button onClick={() => setViewingId(null)}>Close</Button>
          <Button variant="contained" startIcon={<PaymentsIcon />} onClick={openRefund}
            disabled={detail.data.refundableAmount <= 0}>
            {detail.data.refundableAmount > 0 ? 'Refund payment' : 'Fully refunded'}
          </Button>
        </DialogActions>}
      </Dialog>

      <Dialog open={refundOpen} onClose={() => !refundReturn.isPending && setRefundOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Refund payment — {detail.data?.returnNumber}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              Credit note {money(detail.data?.grandTotal ?? 0)} · already refunded {money(detail.data?.refundedAmount ?? 0)} · due {money(detail.data?.refundableAmount ?? 0)}
            </Alert>
            <TextField select label="Pay from account *" value={refundAccountId}
              onChange={(event) => setRefundAccountId(event.target.value)}>
              {(refundAccounts.data ?? []).filter((account) => account.isActive).map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name} · {money(account.currentBalance)}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Refund amount *" type="number" value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
              inputProps={{ min: 0.01, max: detail.data?.refundableAmount, step: 0.01 }} />
            <TextField label="Reference number" value={refundReference}
              onChange={(event) => setRefundReference(event.target.value)} />
            <TextField label="Remarks" value={refundRemarks} multiline minRows={2}
              onChange={(event) => setRefundRemarks(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefundOpen(false)} disabled={refundReturn.isPending}>Cancel</Button>
          <Button variant="contained" onClick={() => void submitRefund()}
            disabled={refundReturn.isPending || !refundAccountId || Number(refundAmount) <= 0 || Number(refundAmount) > (detail.data?.refundableAmount ?? 0)}>
            {refundReturn.isPending ? 'Posting…' : 'Post refund'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createOpen} onClose={closeCreate} maxWidth="lg" fullWidth>
        <DialogTitle>New sales return</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Select a posted invoice. Returned stock goes back to each item's original issuing godown,
              and the credit note reduces the invoice outstanding.
            </Typography>
            <Autocomplete
              options={(returnableInvoices.data?.items ?? []).filter(
                (invoice) => invoice.grandTotal - invoice.paidAmount - invoice.returnedAmount > 0.005,
              )}
              value={(returnableInvoices.data?.items ?? []).find((invoice) => invoice.id === invoiceId) ?? null}
              onInputChange={(_, value, reason) => {
                if (reason === 'input') setInvoiceSearch(value);
                if (reason === 'clear') setInvoiceSearch('');
              }}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              getOptionLabel={(invoice) =>
                `${invoice.invoiceNumber} · ${invoice.customerName}${invoice.customerMobile ? ` · ${invoice.customerMobile}` : ''} · ${invoice.branchName} · ${money(invoice.balanceAmount)} balance`
              }
              onChange={(_, invoice) => {
                setInvoiceId(invoice?.id ?? '');
                setReturnQty({});
              }}
              noOptionsText="No posted invoice found"
              renderInput={(params) => (
                <TextField {...params} label="Sales invoice *" placeholder="Search invoice, customer or phone" />
              )}
            />
            {invoiceDetail.data && (
              <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 820 }}>
                <TableHead><TableRow>
                  <TableCell>Item</TableCell><TableCell>Godown</TableCell>
                  <TableCell>Available to return</TableCell><TableCell width={120}>Boxes</TableCell>
                  <TableCell width={120}>Pieces</TableCell>
                  <TableCell align="right">Rate incl GST</TableCell>
                  <TableCell align="right">Return value</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {(invoiceDetail.data.lines ?? []).map((line) => {
                    const available = Math.max(0, line.qtyBoxes - line.returnedQtyBoxes);
                    const quantity = returnQty[line.id];
                    const qtyBoxes = Number(quantity?.boxes || 0)
                      + Number(quantity?.pieces || 0) / line.piecesPerBox;
                    const lineReturnValue = line.qtyBoxes > 0
                      ? Math.round(line.lineTotal * qtyBoxes / line.qtyBoxes * 100) / 100
                      : 0;
                    const rateIncludingGst = line.qtyBoxes > 0 ? line.lineTotal / line.qtyBoxes : 0;
                    return (
                      <TableRow key={line.id}>
                        <TableCell>{line.productName}</TableCell>
                        <TableCell>{line.godownName}</TableCell>
                        <TableCell>{formatBoxPieces(available, line.piecesPerBox, line.baseUom === 'PIECE')}</TableCell>
                        <TableCell><TextField
                          size="small" type="number" value={returnQty[line.id]?.boxes ?? ''}
                          inputProps={{ min: 0 }} disabled={available <= 0}
                          onChange={(event) => setReturnQty((current) => ({
                            ...current,
                            [line.id]: { boxes: event.target.value, pieces: current[line.id]?.pieces ?? '' },
                          }))}
                        /></TableCell>
                        <TableCell><TextField
                          size="small" type="number" value={returnQty[line.id]?.pieces ?? ''}
                          inputProps={{ min: 0, max: line.piecesPerBox - 1 }} disabled={available <= 0}
                          onChange={(event) => setReturnQty((current) => ({
                            ...current,
                            [line.id]: { boxes: current[line.id]?.boxes ?? '', pieces: event.target.value },
                          }))}
                        /></TableCell>
                        <TableCell align="right">{money(rateIncludingGst)}</TableCell>
                        <TableCell align="right"><strong>{money(lineReturnValue)}</strong></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Stack direction="row" spacing={3} justifyContent="flex-end" sx={{ px: 2, py: 1.5 }}>
                <Typography variant="body2">Sub total: {money(returnValue.subTotal)}</Typography>
                <Typography variant="body2">GST: {money(returnValue.gst)}</Typography>
                <Typography variant="subtitle2">Total return value: {money(returnValue.grandTotal)}</Typography>
              </Stack>
              </Box>
            )}
            <TextField
              label="Reason *" multiline minRows={2} value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
            />
            <TextField
              label="Remarks" multiline minRows={2} value={returnRemarks}
              onChange={(event) => setReturnRemarks(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={closeCreate}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void submitReturn()}
            disabled={!invoiceId || returnReason.trim().length < 2 || createReturn.isPending}
          >
            Post sales return
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
