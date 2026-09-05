import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useSaveShortcut } from '@tiles-erp/ui';
import type {
  ReceiptAllocationInput,
  ReceiptMode,
  ReceiptPaymentInput,
} from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useLedgerAccounts } from '../accounts/api';
import { useBranches } from '../products/branch-prices-api';
import { useCustomers } from './api';
import { useCreateReceipt, useCustomerDue, useOpenInvoices } from './receipts-api';

interface ReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (receiptNumber: string) => void;
}

const MODES: { value: ReceiptMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
];

/** Modes that identify the money by a reference the customer can be asked for. */
const NEEDS_REFERENCE: ReceiptMode[] = ['UPI', 'BANK', 'CHEQUE', 'CARD'];

/** Which kind of account each mode lands in, so the picker is not a list of everything. */
const LANDS_IN: Record<ReceiptMode, 'CASH' | 'BANK' | null> = {
  CASH: 'CASH',
  UPI: 'BANK',
  BANK: 'BANK',
  CHEQUE: 'BANK',
  CARD: 'BANK',
  MIXED: null,
};

/** One tender being entered: cash 1,000 and UPI 5,000 are two of these. */
interface PaymentRow {
  mode: ReceiptMode;
  amount: string;
  referenceNo: string;
  accountId: string;
}

const blankPayment: PaymentRow = { mode: 'CASH', amount: '', referenceNo: '', accountId: '' };

const round2 = (value: number): number => Math.round(value * 100) / 100;

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (value: string): string => new Date(value).toLocaleDateString('en-IN');

/**
 * Records money from a customer. The amount is spread over the oldest open invoices as
 * you type, which is what a counter does by hand; individual amounts can be overridden.
 */
export function ReceiptDialog({ open, onClose, onCreated }: ReceiptDialogProps): JSX.Element {
  const customers = useCustomers();
  const branches = useBranches();
  const createReceipt = useCreateReceipt();
  const accounts = useLedgerAccounts();

  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payments, setPayments] = useState<PaymentRow[]>([blankPayment]);
  const [remarks, setRemarks] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const openInvoices = useOpenInvoices(open && customerId ? customerId : null, branchId || undefined);
  const invoices = useMemo(() => openInvoices.data ?? [], [openInvoices.data]);
  const due = useCustomerDue(open && customerId ? customerId : null, branchId || undefined);

  // The receipt total is whatever the tenders add up to; it is never typed separately.
  const amount = round2(
    payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );

  useEffect(() => {
    if (open) return;
    setCustomerId('');
    setPayments([blankPayment]);
    setRemarks('');
    setOverrides({});
    setError(null);
  }, [open]);

  // One branch means no choice to make.
  useEffect(() => {
    if (!branchId && (branches.data?.length ?? 0) === 1) setBranchId(branches.data![0]!.id);
  }, [branches.data, branchId]);

  useEffect(() => setOverrides({}), [customerId, amount]);

  const setPayment = (index: number, patch: Partial<PaymentRow>): void =>
    setPayments((previous) =>
      previous.map((payment, i) => (i === index ? { ...payment, ...patch } : payment)),
    );

  /**
   * The accounts a given tender could land in: this branch's, of the matching kind.
   *
   * Cash goes in a drawer and a bank transfer goes in a bank account, so offering all of
   * them would invite putting a cheque in the till. Company-wide accounts are offered too,
   * since a head-office bank account takes money for any branch.
   */
  const accountsFor = (mode: ReceiptMode) => {
    const kind = LANDS_IN[mode];
    return (accounts.data ?? []).filter(
      (account) =>
        (!kind || account.type === kind) &&
        (account.branchId === null || account.branchId === branchId),
    );
  };

  /**
   * Defaults each row to the only account it could possibly mean.
   *
   * With one drawer and one bank account per branch — which is most of them — nobody
   * should have to pick. Rows the clerk has already touched are left alone.
   */
  const available = accounts.data;
  useEffect(() => {
    if (!branchId || !available) return;
    setPayments((previous) =>
      previous.map((payment) => {
        if (payment.accountId) return payment;
        const kind = LANDS_IN[payment.mode];
        const candidates = available.filter(
          (account) =>
            (!kind || account.type === kind) &&
            (account.branchId === null || account.branchId === branchId),
        );
        return candidates.length === 1 ? { ...payment, accountId: candidates[0]!.id } : payment;
      }),
    );
  }, [branchId, available]);

  // Suggested split: fill the oldest invoices until the money runs out.
  const suggested = useMemo(() => {
    let remaining = amount;
    const result: Record<string, number> = {};
    for (const invoice of invoices) {
      if (remaining <= 0.005) break;
      const settle = round2(Math.min(invoice.balanceAmount, remaining));
      result[invoice.salesInvoiceId] = settle;
      remaining = round2(remaining - settle);
    }
    return result;
  }, [amount, invoices]);

  const allocationFor = (salesInvoiceId: string): number => {
    const override = overrides[salesInvoiceId];
    if (override !== undefined) return round2(Number(override || 0));
    return suggested[salesInvoiceId] ?? 0;
  };

  const allocatedAmount = round2(
    invoices.reduce((sum, invoice) => sum + allocationFor(invoice.salesInvoiceId), 0),
  );
  const onAccount = round2(amount - allocatedAmount);

  // What the customer still owes once this receipt is posted.
  const outstandingBefore = due.data?.outstandingAmount ?? 0;
  const balanceAfter = round2(outstandingBefore - allocatedAmount);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!customerId) {
      setError('Choose the customer');
      return;
    }
    if (!branchId) {
      setError('Choose the branch');
      return;
    }
    if (amount <= 0) {
      setError('Enter the amount received');
      return;
    }
    if (onAccount < -0.005) {
      setError('The allocations add up to more than the amount received');
      return;
    }

    const allocations: ReceiptAllocationInput[] = invoices
      .map((invoice) => ({
        salesInvoiceId: invoice.salesInvoiceId,
        amount: allocationFor(invoice.salesInvoiceId),
      }))
      .filter((allocation) => allocation.amount > 0);

    try {
      const tenders: ReceiptPaymentInput[] = payments
        .filter((payment) => Number(payment.amount || 0) > 0)
        .map((payment) => ({
          mode: payment.mode,
          amount: round2(Number(payment.amount)),
          referenceNo: payment.referenceNo.trim() || undefined,
          accountId: payment.accountId || undefined,
        }));

      const receipt = await createReceipt.mutateAsync({
        customerId,
        branchId,
        receiptDate: new Date(receiptDate).toISOString(),
        payments: tenders,
        remarks: remarks.trim() || undefined,
        allocations,
      });
      onCreated(receipt.receiptNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record the receipt');
    }
  };

  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Receipt from customer</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              label="Customer *"
              size="small"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              sx={{ flex: 2 }}
            >
              {(customers.data ?? []).map((customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.phone ? ` · ${customer.phone}` : ''}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Branch *"
              size="small"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              sx={{ flex: 1 }}
            >
              {(branches.data ?? []).map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              label="Date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              sx={{ width: 190 }}
            />
            {customerId && due.data && (
              <Alert severity={due.data.overdueAmount > 0 ? 'warning' : 'info'} sx={{ py: 0, flex: 1 }}>
                Outstanding <strong>{money(due.data.outstandingAmount)}</strong> across{' '}
                {due.data.invoiceCount} invoice{due.data.invoiceCount === 1 ? '' : 's'}
                {due.data.overdueAmount > 0 ? `, of which ${money(due.data.overdueAmount)} is overdue` : ''}
              </Alert>
            )}
          </Stack>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 160 }}>Payment mode</TableCell>
                <TableCell sx={{ width: 140 }} align="right">
                  Amount
                </TableCell>
                <TableCell>Reference</TableCell>
                <TableCell sx={{ width: 200 }}>Into account</TableCell>
                <TableCell sx={{ width: 44 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((payment, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={payment.mode}
                      onChange={(e) => setPayment(index, { mode: e.target.value as ReceiptMode })}
                    >
                      {MODES.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      fullWidth
                      value={payment.amount}
                      onChange={(e) => setPayment(index, { amount: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder={payment.mode === 'CHEQUE' ? 'Cheque number' : 'Reference'}
                      disabled={!NEEDS_REFERENCE.includes(payment.mode)}
                      value={payment.referenceNo}
                      onChange={(e) => setPayment(index, { referenceNo: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={accountsFor(payment.mode).some((a) => a.id === payment.accountId)
                        ? payment.accountId
                        : ''}
                      onChange={(e) => setPayment(index, { accountId: e.target.value })}
                      SelectProps={{ displayEmpty: true }}
                      error={Boolean(payment.amount) && !payment.accountId}
                    >
                      <MenuItem value="">
                        <Typography variant="body2" color="text.secondary">
                          Not recorded
                        </Typography>
                      </MenuItem>
                      {accountsFor(payment.mode).map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          {account.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={payments.length === 1}
                      onClick={() =>
                        setPayments((previous) => previous.filter((_, i) => i !== index))
                      }
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setPayments((previous) => [...previous, blankPayment])}
            sx={{ alignSelf: 'flex-start' }}
          >
            Add payment mode
          </Button>

          {(accounts.data ?? []).length === 0 ? (
            <Alert severity="info">
              No cash or bank accounts have been set up yet. The receipt will still record the
              money against the customer, but it will not appear in any cash book. Add them
              under <strong>Cash &amp; bank</strong>.
            </Alert>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Posting this receipt puts each amount into the account named beside it, so the
              cash book and the customer ledger agree without typing it twice. Rows left as
              “not recorded” settle the invoice but stay out of the book.
            </Typography>
          )}

          {customerId && invoices.length === 0 && !openInvoices.isLoading && (
            <Alert severity="info">
              This customer has no unpaid invoices. The whole amount will sit on account as an
              advance.
            </Alert>
          )}

          {invoices.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Invoice</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                  <TableCell align="right">Overdue</TableCell>
                  <TableCell align="right">Settle</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.salesInvoiceId}>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell>{date(invoice.invoiceDate)}</TableCell>
                    <TableCell align="right">{money(invoice.grandTotal)}</TableCell>
                    <TableCell align="right">{money(invoice.balanceAmount)}</TableCell>
                    <TableCell align="right">
                      {invoice.overdueDays > 0 ? (
                        <Chip label={`${invoice.overdueDays}d`} size="small" color="warning" />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        value={
                          overrides[invoice.salesInvoiceId] ??
                          String(suggested[invoice.salesInvoiceId] ?? 0)
                        }
                        onChange={(e) =>
                          setOverrides((previous) => ({
                            ...previous,
                            [invoice.salesInvoiceId]: e.target.value,
                          }))
                        }
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        color={
                          round2(
                            invoice.balanceAmount - allocationFor(invoice.salesInvoiceId),
                          ) <= 0.005
                            ? 'success.main'
                            : 'text.primary'
                        }
                      >
                        {money(
                          round2(invoice.balanceAmount - allocationFor(invoice.salesInvoiceId)),
                        )}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <TextField
            label="Remarks"
            size="small"
            multiline
            minRows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />

          <Stack
            direction="row"
            spacing={3}
            justifyContent="flex-end"
            alignItems="baseline"
            flexWrap="wrap"
            useFlexGap
          >
            <Typography variant="body2" color="text.secondary">
              Outstanding {money(outstandingBefore)}
            </Typography>
            <Typography variant="body2">Received {money(amount)}</Typography>
            <Typography variant="body2">Allocated {money(allocatedAmount)}</Typography>
            {onAccount !== 0 && (
              <Typography variant="body2" color={onAccount < 0 ? 'error.main' : 'info.main'}>
                On account {money(onAccount)}
              </Typography>
            )}
            <Typography
              variant="h6"
              fontWeight={700}
              color={balanceAfter <= 0.005 ? 'success.main' : 'text.primary'}
            >
              Balance {money(balanceAfter)}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Balance is what the customer still owes once this receipt is posted. Money not tied to
            an invoice stays on account as an advance.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={createReceipt.isPending}>
          {createReceipt.isPending ? 'Saving…' : 'Record receipt'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
