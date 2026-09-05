import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import UndoIcon from '@mui/icons-material/Undo';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import type { CashEntryItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { CashEntryDialog } from './CashEntryDialog';
import { useCashBook, useCashPosition, useLedgerAccounts, useReverseCashEntry } from './api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const localDay = (offsetDays = 0): string => {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const dayOf = (iso: string): string => new Date(iso).toLocaleDateString('en-IN');

const TYPE_LABEL: Record<CashEntryItem['type'], string> = {
  RECEIPT: 'Receipt',
  PAYMENT: 'Payment',
  EXPENSE: 'Expense',
  TRANSFER: 'Transfer',
  ADJUSTMENT: 'Adjustment',
};

const SOURCE_LABEL: Record<CashEntryItem['source'], string> = {
  MANUAL: 'Typed',
  CUSTOMER_RECEIPT: 'Collection',
  SUPPLIER_PAYMENT: 'Supplier payment',
  DRIVER_CASH: 'Driver handover',
  CASH_COUNT: 'Day close',
};

/** What an entry was for, in the order a person would look for it. */
const describe = (entry: CashEntryItem): string =>
  entry.expenseHeadName ??
  entry.counterAccountName ??
  entry.refNumber ??
  entry.narration ??
  TYPE_LABEL[entry.type];

const csvOf = (entries: CashEntryItem[]): string => {
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const header = [
    'Date',
    'Number',
    'Type',
    'Details',
    'Reference',
    'In',
    'Out',
    'Balance',
    'Status',
  ];
  const rows = entries.map((entry) => [
    dayOf(entry.entryDate),
    entry.entryNumber,
    TYPE_LABEL[entry.type],
    describe(entry),
    entry.referenceNo ?? '',
    entry.direction === 'IN' ? entry.amount.toFixed(2) : '',
    entry.direction === 'OUT' ? entry.amount.toFixed(2) : '',
    entry.balance.toFixed(2),
    entry.reversedAt ? 'Reversed' : '',
  ]);
  return [header, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(',')).join('\n');
};

/**
 * One account's book: what it held, what moved, what it holds now.
 *
 * The balance column is counted from the rows beside it rather than stored, so the page
 * cannot disagree with itself. Nothing here edits or deletes — a mistake is corrected
 * with a contra row, and both stay on the page.
 */
export function CashBookPage(): JSX.Element {
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(localDay(-30));
  const [to, setTo] = useState(localDay());
  const [showReversed, setShowReversed] = useState(false);
  const [entering, setEntering] = useState(false);
  const [reversing, setReversing] = useState<CashEntryItem | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: accounts = [] } = useLedgerAccounts();
  const { data: book, isLoading } = useCashBook(
    { accountId, from, to, includeReversed: showReversed },
    Boolean(accountId),
  );
  const { data: position } = useCashPosition(to);
  const reverse = useReverseCashEntry();

  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0]!.id);
  }, [accounts, accountId]);

  /** Day totals, so a page that spans a month still reads day by day. */
  const dayBreaks = useMemo(() => {
    const seen = new Set<string>();
    const breaks = new Map<string, boolean>();
    for (const entry of book?.entries ?? []) {
      const day = dayOf(entry.entryDate);
      if (!seen.has(day)) {
        seen.add(day);
        breaks.set(entry.id, true);
      }
    }
    return breaks;
  }, [book]);

  const download = (): void => {
    if (!book) return;
    const blob = new Blob([csvOf(book.entries)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cash-book-${book.accountName.replace(/\s+/g, '-')}-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const confirmReverse = async (): Promise<void> => {
    if (!reversing) return;
    setError(null);
    try {
      await reverse.mutateAsync({ id: reversing.id, reason });
      setNote(`${reversing.entryNumber} reversed`);
      setReversing(null);
      setReason('');
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not reverse that entry');
    }
  };

  return (
    <PageContainer
      title="Cash book"
      subtitle="Every rupee in and out of one account, with the balance carried down"
      actions={
        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<DownloadIcon />}
            disabled={!book?.entries.length}
            onClick={download}
          >
            CSV
          </Button>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            disabled={accounts.length === 0}
            onClick={() => setEntering(true)}
          >
            New entry
          </Button>
        </Stack>
      }
    >
      {note && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNote(null)}>
          {note}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            size="small"
            label="Account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            sx={{ minWidth: 280 }}
          >
            {accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>
                {account.name}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {account.branchName ?? 'Company'}
                </Typography>
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="date"
            size="small"
            label="From"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            size="small"
            label="To"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showReversed}
                onChange={(event) => setShowReversed(event.target.checked)}
              />
            }
            label="Show reversed"
          />
        </Stack>
        {!showReversed && (book?.reversedHidden ?? 0) > 0 && (
          <Typography variant="caption" color="text.secondary">
            {book!.reversedHidden} cancelled row{book!.reversedHidden === 1 ? '' : 's'} hidden.
            The pair nets to nothing, so the totals read as what actually moved.
          </Typography>
        )}
      </Paper>

      {book && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <Figure label="Opening" value={book.openingBalance} />
          <Figure label="Received" value={book.received} tone="success.main" />
          <Figure label="Paid" value={book.paid} tone="error.main" />
          <Figure label="Closing" value={book.closingBalance} strong />
        </Stack>
      )}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Number</TableCell>
              <TableCell>Details</TableCell>
              <TableCell>Reference</TableCell>
              <TableCell align="right">In</TableCell>
              <TableCell align="right">Out</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell width={48}>&nbsp;</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {book && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary">
                    Opening balance
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{money(book.openingBalance)}</Typography>
                </TableCell>
                <TableCell />
              </TableRow>
            )}

            {(book?.entries ?? []).map((entry) => (
              <TableRow
                key={entry.id}
                hover
                sx={{
                  ...(dayBreaks.get(entry.id) ? { '& td': { borderTopStyle: 'solid' } } : {}),
                  ...(entry.reversedAt ? { opacity: 0.55 } : {}),
                }}
              >
                <TableCell>{dayOf(entry.entryDate)}</TableCell>
                <TableCell>
                  <Typography variant="caption" fontFamily="monospace">
                    {entry.entryNumber}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography
                      variant="body2"
                      sx={entry.reversedAt ? { textDecoration: 'line-through' } : undefined}
                    >
                      {describe(entry)}
                    </Typography>
                    <Chip size="small" variant="outlined" label={TYPE_LABEL[entry.type]} />
                    {entry.source !== 'MANUAL' && (
                      <Chip size="small" label={SOURCE_LABEL[entry.source]} />
                    )}
                    {entry.reversedAt && <Chip size="small" color="warning" label="Reversed" />}
                  </Stack>
                  {entry.narration && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {entry.narration}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{entry.referenceNo ?? '—'}</Typography>
                </TableCell>
                <TableCell align="right">
                  {entry.direction === 'IN' ? (
                    <Typography variant="body2" color="success.main">
                      {money(entry.amount)}
                    </Typography>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell align="right">
                  {entry.direction === 'OUT' ? (
                    <Typography variant="body2" color="error.main">
                      {money(entry.amount)}
                    </Typography>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{money(entry.balance)}</Typography>
                </TableCell>
                <TableCell>
                  {!entry.reversedAt && (
                    <Tooltip title="Reverse with a contra entry">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setReversing(entry);
                          setReason('');
                        }}
                      >
                        <UndoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}

            {book && book.entries.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    Nothing moved in or out of {book.accountName} between these dates.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {book && (
              <TableRow>
                <TableCell colSpan={4} align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Closing balance
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    {money(book.received)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    {money(book.paid)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700}>
                    {money(book.closingBalance)}
                  </Typography>
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {position && position.rows.length > 1 && (
        <Paper variant="outlined" sx={{ mt: 3, p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Where the money is on {new Date(position.on).toLocaleDateString('en-IN')}
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <Table size="small">
            <TableBody>
              {position.rows.map((row) => (
                <TableRow key={row.accountId} hover>
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {row.branchName ?? 'Company'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{money(row.closingBalance)}</Typography>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Cash {money(position.totalCash)} · Bank {money(position.totalBank)}
                    {position.totalWithOwners > 0 &&
                      ` · With owners ${money(position.totalWithOwners)}`}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700}>
                    {money(position.total)}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Paper>
      )}

      <CashEntryDialog
        open={entering}
        accounts={accounts}
        accountId={accountId}
        onClose={() => setEntering(false)}
        onPosted={setNote}
      />

      <Dialog
        open={Boolean(reversing)}
        onClose={() => setReversing(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reverse {reversing?.entryNumber}?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              The entry stays on the page and a matching contra row is written beside it. The
              balance ends where it was, and both rows explain why.
            </Typography>
            <TextField
              size="small"
              autoFocus
              label="Why"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Posted to the wrong account"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setReversing(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!reason.trim() || reverse.isPending}
            onClick={() => void confirmReverse()}
          >
            Reverse
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

function Figure({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: number;
  tone?: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box>
        <Typography variant="h6" color={tone} fontWeight={strong ? 700 : 500}>
          {money(value)}
        </Typography>
      </Box>
    </Paper>
  );
}
