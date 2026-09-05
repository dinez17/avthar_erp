import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { transferProblem, wouldOverdraw } from '@tiles-erp/shared';
import type { LedgerAccountItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useCashTransfer, useExpenseHeads, usePostCashEntry } from './api';

type Kind = 'EXPENSE' | 'RECEIPT' | 'PAYMENT' | 'TRANSFER';

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: 'EXPENSE', label: 'Expense', hint: 'Money spent on something' },
  { value: 'RECEIPT', label: 'Money in', hint: 'Cash or a credit not tied to an invoice' },
  { value: 'PAYMENT', label: 'Money out', hint: 'A payment not tied to a supplier bill' },
  { value: 'TRANSFER', label: 'Transfer', hint: 'Between two of your own accounts' },
];

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const todayLocal = (): string => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

interface Props {
  open: boolean;
  accounts: LedgerAccountItem[];
  /** The account the book is currently showing, used as the default. */
  accountId?: string;
  onClose: () => void;
  onPosted: (message: string) => void;
}

/**
 * One dialog for everything typed by hand.
 *
 * Expense, money in, money out and transfer are four shapes of the same row, so they
 * share a form rather than four screens that drift apart. The tab decides which fields
 * are asked for and which way the money goes.
 */
export function CashEntryDialog({
  open,
  accounts,
  accountId,
  onClose,
  onPosted,
}: Props): JSX.Element {
  const [kind, setKind] = useState<Kind>('EXPENSE');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [amount, setAmount] = useState('');
  const [headId, setHeadId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [narration, setNarration] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: heads = [] } = useExpenseHeads();
  const post = usePostCashEntry();
  const transfer = useCashTransfer();

  useEffect(() => {
    if (!open) return;
    setKind('EXPENSE');
    setFrom(accountId ?? accounts[0]?.id ?? '');
    setTo('');
    setDate(todayLocal());
    setAmount('');
    setHeadId('');
    setReferenceNo('');
    setNarration('');
    setError(null);
  }, [open, accountId, accounts]);

  const source = useMemo(() => accounts.find((a) => a.id === from), [accounts, from]);
  const value = Number(amount) || 0;
  const leaving = kind === 'EXPENSE' || kind === 'PAYMENT' || kind === 'TRANSFER';

  /**
   * Warned before the request rather than after.
   *
   * The server refuses an overdrawn drawer anyway, but finding out after typing a
   * narration is a worse experience than seeing it as you pick the account.
   */
  const shortfall =
    leaving && source?.type === 'CASH' && value > 0 && wouldOverdraw(source.currentBalance, value)
      ? `${source.name} holds ${money(source.currentBalance)} — a drawer cannot go negative`
      : null;

  const problem =
    kind === 'TRANSFER'
      ? transferProblem(from, to, value)
      : !from
        ? 'Choose an account'
        : value <= 0
          ? 'Enter an amount greater than zero'
          : kind === 'EXPENSE' && !headId
            ? 'Choose what the expense is for'
            : null;

  const submit = async (): Promise<void> => {
    setError(null);
    const entryDate = new Date(`${date}T00:00:00`).toISOString();
    try {
      if (kind === 'TRANSFER') {
        await transfer.mutateAsync({
          fromAccountId: from,
          toAccountId: to,
          entryDate,
          amount: value,
          referenceNo: referenceNo.trim() || undefined,
          narration: narration.trim() || undefined,
        });
        const target = accounts.find((a) => a.id === to);
        onPosted(`${money(value)} moved from ${source?.name} to ${target?.name}`);
      } else {
        await post.mutateAsync({
          accountId: from,
          entryDate,
          type: kind,
          amount: value,
          expenseHeadId: kind === 'EXPENSE' ? headId : undefined,
          referenceNo: referenceNo.trim() || undefined,
          narration: narration.trim() || undefined,
        });
        onPosted(`${money(value)} posted to ${source?.name}`);
      }
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not post that entry');
    }
  };

  const busy = post.isPending || transfer.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>Cash entry</DialogTitle>
      <Tabs
        value={kind}
        onChange={(_, next: Kind) => setKind(next)}
        variant="fullWidth"
        sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        {KINDS.map((option) => (
          <Tab key={option.value} value={option.value} label={option.label} />
        ))}
      </Tabs>

      <DialogContent>
        <Typography variant="caption" color="text.secondary">
          {KINDS.find((option) => option.value === kind)?.hint}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack spacing={2} sx={{ mt: 2 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              select
              size="small"
              fullWidth
              label={kind === 'TRANSFER' ? 'Out of' : 'Account'}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            >
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {account.branchName ?? 'Company'} · {money(account.currentBalance)}
                  </Typography>
                </MenuItem>
              ))}
            </TextField>

            {kind === 'TRANSFER' && (
              <TextField
                select
                size="small"
                fullWidth
                label="Into"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              >
                {accounts
                  .filter((account) => account.id !== from)
                  .map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.name}
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 1 }}
                      >
                        {account.branchName ?? 'Company'}
                      </Typography>
                    </MenuItem>
                  ))}
              </TextField>
            )}
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              type="date"
              size="small"
              fullWidth
              label="Date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              fullWidth
              label="Amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputProps={{ inputMode: 'decimal' }}
              error={Boolean(shortfall)}
              helperText={shortfall ?? ' '}
            />
          </Stack>

          {kind === 'EXPENSE' && (
            <TextField
              select
              size="small"
              fullWidth
              label="Spent on"
              value={headId}
              onChange={(event) => setHeadId(event.target.value)}
              helperText={
                heads.length === 0
                  ? 'No expense heads yet — add one on the Expense heads screen first'
                  : ' '
              }
            >
              {heads.map((head) => (
                <MenuItem key={head.id} value={head.id}>
                  {head.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            size="small"
            fullWidth
            label="Reference"
            value={referenceNo}
            onChange={(event) => setReferenceNo(event.target.value)}
            placeholder="Cheque number, UPI reference, voucher number"
          />

          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label="Narration"
            value={narration}
            onChange={(event) => setNarration(event.target.value)}
            placeholder="What this was, in the words you would use to explain it later"
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={Boolean(problem) || Boolean(shortfall) || busy}
          onClick={() => void submit()}
        >
          {problem ?? `Post ${money(value)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
