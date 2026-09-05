import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
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
import { useEffect, useMemo, useState } from 'react';
import { settleOldestFirst } from '@tiles-erp/shared';
import type {
  ReceiptMode,
  SupplierPaymentAllocationInput,
  SupplierPaymentDebitNoteInput,
  SupplierPaymentTenderInput,
} from '@tiles-erp/shared-types';
import { useSaveShortcut } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { useLedgerAccounts } from '../accounts/api';
import { useBranches } from '../products/branch-prices-api';
import { useSuppliers } from './api';
import {
  useCreateSupplierPayment,
  useOpenBills,
  useOpenDebitNotes,
  useSupplierDue,
} from './supplier-payments-api';

interface SupplierPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (paymentNumber: string) => void;
}

const MODES: { value: ReceiptMode; label: string }[] = [
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
];

/** Modes the bank will later ask you to identify by a reference. */
const NEEDS_REFERENCE: ReceiptMode[] = ['BANK', 'CHEQUE', 'UPI', 'CARD'];

/** Which kind of account each tender leaves from, so the picker is not a list of everything. */
const LEAVES_FROM: Record<ReceiptMode, 'CASH' | 'BANK' | null> = {
  CASH: 'CASH',
  UPI: 'BANK',
  BANK: 'BANK',
  CHEQUE: 'BANK',
  CARD: 'BANK',
  MIXED: null,
};

interface TenderRow {
  mode: ReceiptMode;
  amount: string;
  referenceNo: string;
  accountId: string;
}

const blankTender: TenderRow = { mode: 'BANK', amount: '', referenceNo: '', accountId: '' };

const round2 = (value: number): number => Math.round(value * 100) / 100;

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (value: string): string => new Date(value).toLocaleDateString('en-IN');

/**
 * Pays a supplier.
 *
 * The money is spread over the bills falling due soonest as you type, which is what a
 * clerk does by hand; individual amounts can be overridden. Debit notes are picked
 * separately and count towards what the payment can settle — credit with the supplier
 * spends exactly like cash, it just never leaves the bank.
 */
export function SupplierPaymentDialog({
  open,
  onClose,
  onCreated,
}: SupplierPaymentDialogProps): JSX.Element {
  const suppliers = useSuppliers();
  const branches = useBranches();
  const accounts = useLedgerAccounts();
  const createPayment = useCreateSupplierPayment();

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tenders, setTenders] = useState<TenderRow[]>([blankTender]);
  const [remarks, setRemarks] = useState('');
  const [notesUsed, setNotesUsed] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const active = open && supplierId ? supplierId : null;
  const openBills = useOpenBills(active, branchId || undefined);
  const bills = useMemo(() => openBills.data ?? [], [openBills.data]);
  const openNotes = useOpenDebitNotes(active, branchId || undefined);
  const notes = useMemo(() => openNotes.data ?? [], [openNotes.data]);
  const due = useSupplierDue(active, branchId || undefined);

  const cashAmount = round2(tenders.reduce((sum, tender) => sum + Number(tender.amount || 0), 0));
  const creditAmount = round2(
    notes.reduce((sum, note) => sum + Number(notesUsed[note.purchaseReturnId] ?? 0), 0),
  );
  const settleable = round2(cashAmount + creditAmount);

  useEffect(() => {
    if (open) return;
    setSupplierId('');
    setTenders([blankTender]);
    setRemarks('');
    setNotesUsed({});
    setOverrides({});
    setError(null);
  }, [open]);

  // One branch means no choice to make.
  useEffect(() => {
    if (!branchId && (branches.data?.length ?? 0) === 1) setBranchId(branches.data![0]!.id);
  }, [branches.data, branchId]);

  useEffect(() => {
    setOverrides({});
    setNotesUsed({});
  }, [supplierId]);

  useEffect(() => setOverrides({}), [settleable]);

  /**
   * The accounts a tender could leave from: this branch's, of the matching kind.
   *
   * The balance is shown beside each, because paying 80,000 out of a drawer holding
   * 12,000 is a mistake worth catching before the request rather than after.
   */
  const accountsFor = (mode: ReceiptMode) => {
    const kind = LEAVES_FROM[mode];
    return (accounts.data ?? []).filter(
      (account) =>
        (!kind || account.type === kind) &&
        (account.branchId === null || account.branchId === branchId),
    );
  };

  const setTender = (index: number, patch: Partial<TenderRow>): void =>
    setTenders((previous) =>
      previous.map((tender, i) => (i === index ? { ...tender, ...patch } : tender)),
    );

  // Suggested split: fill the bills due soonest until the money runs out. The API
  // returns them already in that order, and this is the same rule it applies.
  const suggested = useMemo(() => {
    const result: Record<string, number> = {};
    for (const settlement of settleOldestFirst(settleable, bills).settlements) {
      result[settlement.target.purchaseInvoiceId] = settlement.amount;
    }
    return result;
  }, [settleable, bills]);

  const allocationFor = (purchaseInvoiceId: string): number => {
    const override = overrides[purchaseInvoiceId];
    if (override !== undefined) return round2(Number(override || 0));
    return suggested[purchaseInvoiceId] ?? 0;
  };

  const allocatedAmount = round2(
    bills.reduce((sum, bill) => sum + allocationFor(bill.purchaseInvoiceId), 0),
  );
  const onAccount = round2(settleable - allocatedAmount);

  const payableBefore = due.data?.payableAmount ?? 0;
  const balanceAfter = round2(payableBefore - allocatedAmount);

  const toggleNote = (purchaseReturnId: string, balance: number): void =>
    setNotesUsed((previous) => {
      const next = { ...previous };
      if (next[purchaseReturnId] === undefined) next[purchaseReturnId] = String(balance);
      else delete next[purchaseReturnId];
      return next;
    });

  const submit = async (): Promise<void> => {
    setError(null);
    if (!supplierId) {
      setError('Choose the supplier');
      return;
    }
    if (!branchId) {
      setError('Choose the branch');
      return;
    }
    if (settleable <= 0) {
      setError('Enter an amount paid, or tick a debit note to set off');
      return;
    }
    if (onAccount < -0.005) {
      setError('The bills allocated add up to more than the payment is worth');
      return;
    }

    const allocations: SupplierPaymentAllocationInput[] = bills
      .map((bill) => ({
        purchaseInvoiceId: bill.purchaseInvoiceId,
        amount: allocationFor(bill.purchaseInvoiceId),
      }))
      .filter((allocation) => allocation.amount > 0);

    const debitNotes: SupplierPaymentDebitNoteInput[] = Object.entries(notesUsed)
      .map(([purchaseReturnId, amount]) => ({
        purchaseReturnId,
        amount: round2(Number(amount || 0)),
      }))
      .filter((note) => note.amount > 0);

    const paid: SupplierPaymentTenderInput[] = tenders
      .filter((tender) => Number(tender.amount || 0) > 0)
      .map((tender) => ({
        mode: tender.mode,
        amount: round2(Number(tender.amount)),
        referenceNo: tender.referenceNo.trim() || undefined,
        accountId: tender.accountId || undefined,
      }));

    try {
      const payment = await createPayment.mutateAsync({
        supplierId,
        branchId,
        paymentDate: new Date(paymentDate).toISOString(),
        tenders: paid,
        debitNotes,
        remarks: remarks.trim() || undefined,
        allocations,
      });
      onCreated(payment.paymentNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record the payment');
    }
  };

  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Payment to supplier</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              label="Supplier *"
              size="small"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              sx={{ flex: 2 }}
            >
              {(suppliers.data ?? []).map((supplier) => (
                <MenuItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.phone ? ` · ${supplier.phone}` : ''}
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
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              sx={{ width: 190 }}
            />
            {supplierId && due.data && (
              <Alert
                severity={due.data.overdueAmount > 0 ? 'warning' : 'info'}
                sx={{ py: 0, flex: 1 }}
              >
                Payable <strong>{money(due.data.payableAmount)}</strong> across{' '}
                {due.data.billCount} bill{due.data.billCount === 1 ? '' : 's'}
                {due.data.overdueAmount > 0
                  ? `, of which ${money(due.data.overdueAmount)} is overdue`
                  : ''}
                {due.data.advanceAmount > 0
                  ? ` · ${money(due.data.advanceAmount)} already on account`
                  : ''}
              </Alert>
            )}
          </Stack>

          <Divider />
          <Typography variant="subtitle2">Paid by</Typography>

          {tenders.map((tender, index) => (
            <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
              <TextField
                select
                label="Mode"
                size="small"
                value={tender.mode}
                onChange={(e) => setTender(index, { mode: e.target.value as ReceiptMode })}
                sx={{ width: 160 }}
              >
                {MODES.map((mode) => (
                  <MenuItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Amount"
                type="number"
                size="small"
                value={tender.amount}
                onChange={(e) => setTender(index, { amount: e.target.value })}
                sx={{ width: 140 }}
              />
              {NEEDS_REFERENCE.includes(tender.mode) && (
                <>
                  <TextField
                    label={tender.mode === 'CHEQUE' ? 'Cheque no' : 'Reference'}
                    size="small"
                    value={tender.referenceNo}
                    onChange={(e) => setTender(index, { referenceNo: e.target.value })}
                    sx={{ width: 170 }}
                  />
                </>
              )}
              <TextField
                select
                label="Out of"
                size="small"
                value={
                  accountsFor(tender.mode).some((a) => a.id === tender.accountId)
                    ? tender.accountId
                    : ''
                }
                onChange={(e) => setTender(index, { accountId: e.target.value })}
                SelectProps={{ displayEmpty: true }}
                sx={{ width: 200 }}
              >
                <MenuItem value="">
                  <Typography variant="body2" color="text.secondary">
                    Not recorded
                  </Typography>
                </MenuItem>
                {accountsFor(tender.mode).map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 1 }}
                    >
                      {account.currentBalance.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Typography>
                  </MenuItem>
                ))}
              </TextField>
              <IconButton
                aria-label="Remove tender"
                onClick={() => setTenders((prev) => prev.filter((_, i) => i !== index))}
                disabled={tenders.length === 1}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button
            startIcon={<AddIcon />}
            onClick={() => setTenders((prev) => [...prev, blankTender])}
            sx={{ alignSelf: 'flex-start' }}
          >
            Add tender
          </Button>

          {notes.length > 0 && (
            <>
              <Divider />
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2">Debit notes</Typography>
                <Typography variant="caption" color="text.secondary">
                  Credit with this supplier — spends like cash, but never leaves the bank
                </Typography>
              </Stack>

              <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Debit note</TableCell>
                    <TableCell align="right">Credit left</TableCell>
                    <TableCell align="right" sx={{ width: 150 }}>
                      Set off
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {notes.map((note) => {
                    const used = notesUsed[note.purchaseReturnId];
                    return (
                      <TableRow key={note.purchaseReturnId} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={used !== undefined}
                            onChange={() =>
                              toggleNote(note.purchaseReturnId, note.balanceAmount)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{note.returnNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {date(note.returnDate)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{money(note.balanceAmount)}</TableCell>
                        <TableCell align="right">
                          <TextField
                            type="number"
                            size="small"
                            disabled={used === undefined}
                            value={used ?? ''}
                            onChange={(e) =>
                              setNotesUsed((prev) => ({
                                ...prev,
                                [note.purchaseReturnId]: e.target.value,
                              }))
                            }
                            inputProps={{ style: { textAlign: 'right' } }}
                            sx={{ width: 130 }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}

          <Divider />
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2">Bills to settle</Typography>
            <Typography variant="caption" color="text.secondary">
              Due soonest first
            </Typography>
          </Stack>

          {supplierId && bills.length === 0 && (
            <Alert severity="info">
              Nothing outstanding for this supplier. The whole payment will sit as an advance.
            </Alert>
          )}

          {bills.length > 0 && (
            <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Bill</TableCell>
                  <TableCell>Due</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                  <TableCell align="right" sx={{ width: 150 }}>
                    Settle
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bills.map((bill) => (
                  <TableRow key={bill.purchaseInvoiceId} hover>
                    <TableCell>
                      <Typography variant="body2">{bill.supplierInvoiceNo}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {bill.invoiceNumber} · {date(bill.invoiceDate)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {bill.dueDate ? date(bill.dueDate) : 'On sight'}
                      {bill.overdueDays > 0 && (
                        <Chip
                          label={`${bill.overdueDays}d`}
                          size="small"
                          color="error"
                          sx={{ ml: 0.5 }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">{money(bill.balanceAmount)}</TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number"
                        size="small"
                        value={
                          overrides[bill.purchaseInvoiceId] ??
                          (suggested[bill.purchaseInvoiceId] || '')
                        }
                        onChange={(e) =>
                          setOverrides((prev) => ({
                            ...prev,
                            [bill.purchaseInvoiceId]: e.target.value,
                          }))
                        }
                        inputProps={{ style: { textAlign: 'right' } }}
                        sx={{ width: 130 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Stack
            direction="row"
            spacing={3}
            justifyContent="flex-end"
            flexWrap="wrap"
            useFlexGap
          >
            <Figure label="Cash" value={money(cashAmount)} />
            {creditAmount > 0 && <Figure label="Credit used" value={money(creditAmount)} />}
            <Figure label="Allocated" value={money(allocatedAmount)} />
            {onAccount !== 0 && (
              <Tooltip title="Not tied to any bill — sits as an advance with the supplier">
                <span>
                  <Figure
                    label="On account"
                    value={money(onAccount)}
                    error={onAccount < 0}
                  />
                </span>
              </Tooltip>
            )}
            <Figure label="Payable after" value={money(balanceAfter)} bold />
          </Stack>

          <TextField
            label="Remarks"
            size="small"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={createPayment.isPending}>
          {createPayment.isPending ? 'Saving…' : 'Save as draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Figure({
  label,
  value,
  bold = false,
  error = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  error?: boolean;
}): JSX.Element {
  return (
    <Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant={bold ? 'h6' : 'body1'}
        fontWeight={bold ? 700 : 500}
        color={error ? 'error.main' : undefined}
      >
        {value}
      </Typography>
    </Stack>
  );
}
