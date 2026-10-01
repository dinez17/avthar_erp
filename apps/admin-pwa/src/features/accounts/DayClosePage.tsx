import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import {
  DENOMINATIONS,
  denominationTotal,
  handoverPlan,
  hasCounted,
  type DenominationCounts,
} from '@tiles-erp/shared';
import type { CashCountItem, DayCloseStatus, LedgerAccountItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { VariancePanel } from './VariancePanel';
import {
  useCashCounts,
  useCloseDay,
  useDayCloseStatuses,
  useLedgerAccounts,
  useReopenDay,
} from './api';
import { AccountBranchSelect, useAccountBranch } from './AccountBranchSelect';

/**
 * Tolerates a missing figure rather than throwing.
 *
 * This page renders history, and a row written before a column existed — or fetched from
 * an API that has not been restarted since the migration — has nothing in it. Formatting
 * is not the place to discover that: a dash in one cell is a far better outcome than the
 * whole screen refusing to render.
 */
const money = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

const day = (iso: string): string => new Date(iso).toLocaleDateString('en-IN');

/**
 * Counting an account against its book, and locking the day once it is counted.
 *
 * A cash book nobody counts is a guess. The drawer is counted note by note — a total typed
 * straight in is a total someone worked out in their head, and the whole point is to catch
 * the arithmetic the till has been doing all day.
 */
export function DayClosePage(): JSX.Element {
  const branch = useAccountBranch();
  const [postDifference, setPostDifference] = useState(true);
  const [ownerId, setOwnerId] = useState('');
  const [reopening, setReopening] = useState<CashCountItem | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkAccountIds, setBulkAccountIds] = useState<string[]>([]);
  const [bulkCounts, setBulkCounts] = useState<DenominationCounts>({});
  const [bulkNotes, setBulkNotes] = useState('');

  const { data: accounts = [] } = useLedgerAccounts({ branchId: branch.branchId });
  const { data: ownerAccounts = [] } = useLedgerAccounts({ type: 'OWNER' });
  const { data: history = [] } = useCashCounts(undefined, branch.branchId);
  const close = useCloseDay();
  const reopen = useReopenDay();
  const bulkStatuses = useDayCloseStatuses(bulkAccountIds);

  useEffect(() => {
    setBulkAccountIds([]);
    setBulkCounts({});
  }, [branch.branchId]);

  /**
   * Only tills and bank accounts are closed. An owner's holding is not counted at the end
   * of a day — nobody is standing over it — so offering it here would invite locking an
   * account that never needed locking.
   */
  const closeable = useMemo(
    () => accounts.filter((account) => account.type !== 'OWNER'),
    [accounts],
  );

  const owners = useMemo(() => ownerAccounts, [ownerAccounts]);

  const loadedBulkStatuses = bulkStatuses
    .map((query) => query.data)
    .filter((entry): entry is DayCloseStatus => Boolean(entry));
  const bulkLoading = bulkStatuses.some((query) => query.isLoading);
  const bulkDates = new Set(loadedBulkStatuses.map((entry) => entry.nextCloseDate.slice(0, 10)));
  const bulkSameDate = bulkDates.size <= 1;
  const cashStatuses = loadedBulkStatuses.filter((entry) => entry.accountType === 'CASH');
  const totalBook = loadedBulkStatuses.reduce((sum, entry) => sum + entry.expectedBalance, 0);
  const cashCounted = denominationTotal(bulkCounts);
  const bankBook = loadedBulkStatuses
    .filter((entry) => entry.accountType !== 'CASH')
    .reduce((sum, entry) => sum + entry.expectedBalance, 0);
  const totalCounted = cashCounted + bankBook;
  const totalDifference = Math.round((totalCounted - totalBook) * 100) / 100;
  // Day close now clears the physical drawer completely. Every counted denomination,
  // including ₹50/₹20/₹10/₹5 and coins, is handed over instead of being left as a
  // rounded remainder or tomorrow's float.
  const overallPlan = handoverPlan(cashCounted, 0, 1);
  const bulkReady = loadedBulkStatuses.length === bulkAccountIds.length
    && (cashStatuses.length === 0 || hasCounted(bulkCounts));

  const submitBulk = async (): Promise<void> => {
    setError(null);
    setNote(null);
    if (loadedBulkStatuses.length !== bulkAccountIds.length || bulkLoading) return;
    if (!bulkSameDate) {
      setError('The selected accounts have different next closing dates. Close the older accounts first.');
      return;
    }
    const cashNeedsHandover = overallPlan.handover > 0;
    if (cashNeedsHandover && !ownerId) {
      setError('Choose the owner receiving the cash handover.');
      return;
    }

    const closed: string[] = [];
    try {
      // One physical count can cover several cash ledgers. Keep each ledger as close as
      // possible to its book balance, put the combined variance on the final cash ledger,
      // and split the single owner handover without ever overdrawing an account.
      let countedLeft = cashCounted;
      const countedByAccount = new Map<string, number>();
      cashStatuses.forEach((entry, index) => {
        const last = index === cashStatuses.length - 1;
        const amount = last
          ? countedLeft
          : Math.min(countedLeft, Math.max(0, entry.expectedBalance));
        const rounded = Math.round(amount * 100) / 100;
        countedByAccount.set(entry.accountId, rounded);
        countedLeft = Math.round((countedLeft - rounded) * 100) / 100;
      });

      let handoverLeft = overallPlan.handover;
      const handoverByAccount = new Map<string, number>();
      cashStatuses.forEach((entry) => {
        const counted = countedByAccount.get(entry.accountId) ?? 0;
        const amount = Math.min(counted, handoverLeft);
        const rounded = Math.round(amount * 100) / 100;
        handoverByAccount.set(entry.accountId, rounded);
        handoverLeft = Math.round((handoverLeft - rounded) * 100) / 100;
      });

      for (const entry of loadedBulkStatuses) {
        const countedAmountForAccount = entry.accountType === 'CASH'
          ? countedByAccount.get(entry.accountId) ?? 0
          : entry.expectedBalance;
        if (!Number.isFinite(countedAmountForAccount) || countedAmountForAccount < 0) {
          throw new Error(`Enter a valid closing balance for ${entry.accountName}`);
        }
        if (entry.accountType === 'CASH' && !hasCounted(bulkCounts)) {
          throw new Error(`Count the denominations for ${entry.accountName}`);
        }
        const handoverAmount = entry.accountType === 'CASH'
          ? handoverByAccount.get(entry.accountId) ?? 0
          : 0;
        const saved = await close.mutateAsync({
          accountId: entry.accountId,
          closeDate: entry.nextCloseDate,
          countedAmount: countedAmountForAccount,
          // The note breakdown is a combined physical count, so it cannot truthfully be
          // attached to each individual ledger. Each close stores its allocated total.
          denominations: undefined,
          postDifference,
          handoverAmount: handoverAmount > 0 ? handoverAmount : undefined,
          handoverAccountId: handoverAmount > 0 ? ownerId : undefined,
          notes: bulkNotes.trim() || undefined,
        });
        closed.push(saved.countNo);
      }
      setNote(`${closed.length} accounts closed: ${closed.join(', ')}`);
      setBulkAccountIds([]);
      setBulkCounts({});
      setBulkNotes('');
    } catch (problem) {
      const message = problem instanceof ApiError || problem instanceof Error
        ? problem.message
        : 'Could not close the selected accounts';
      setError(closed.length > 0 ? `${closed.length} account(s) closed before the error: ${message}` : message);
    }
  };

  useEffect(() => {
    if (owners.length === 1 && !ownerId) setOwnerId(owners[0]!.id);
  }, [owners, ownerId]);

  const confirmReopen = async (): Promise<void> => {
    if (!reopening) return;
    setError(null);
    try {
      await reopen.mutateAsync({ id: reopening.id, reason });
      setNote(`${reopening.countNo} reopened`);
      setReopening(null);
      setReason('');
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not reopen that day');
    }
  };

  return (
    <PageContainer
      title="Day close"
      subtitle="Count the drawer against the book, then lock the day"
    >
      <Stack sx={{ mb: 2 }}><AccountBranchSelect {...branch} /></Stack>
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
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Close multiple accounts</Typography>
            <Typography variant="caption" color="text.secondary">
              Enter the cash denominations once. All counted cash is handed over; bank balances use their book balance automatically.
            </Typography>
          </Box>
          <Autocomplete<LedgerAccountItem, true>
            multiple
            size="small"
            options={closeable}
            value={closeable.filter((account) => bulkAccountIds.includes(account.id))}
            getOptionLabel={(account) => `${account.name} · ${account.branchName ?? 'Company'}`}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_, selected) => setBulkAccountIds(selected.map((account) => account.id))}
            renderInput={(params) => (
              <TextField {...params} label="Accounts" placeholder={bulkAccountIds.length ? '' : 'Select accounts'} />
            )}
          />

          {cashStatuses.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(9, minmax(0, 1fr))' }, gap: 1 }}>
              {DENOMINATIONS.map((denomination) => (
                <TextField
                  key={denomination}
                  size="small"
                  label={`₹${denomination}`}
                  value={bulkCounts[denomination] || ''}
                  onChange={(event) => setBulkCounts((previous) => ({ ...previous, [denomination]: Math.max(0, Number(event.target.value) || 0) }))}
                  inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                />
              ))}
            </Box>
          )}

          {loadedBulkStatuses.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' }, gap: 1.5 }}>
              <CloseFigure label="Book balance" value={totalBook} />
              <CloseFigure label="Counted" value={cashStatuses.length === 0 || hasCounted(bulkCounts) ? totalCounted : null} />
              <CloseFigure label="Difference" value={cashStatuses.length === 0 || hasCounted(bulkCounts) ? totalDifference : null} color={totalDifference === 0 ? 'success.main' : totalDifference < 0 ? 'error.main' : 'warning.main'} />
              <CloseFigure label="Handover" value={cashStatuses.length === 0 || hasCounted(bulkCounts) ? overallPlan.handover : null} />
              <CloseFigure label="Retained" value={cashStatuses.length === 0 || hasCounted(bulkCounts) ? overallPlan.retained : null} />
            </Box>
          )}

          {bulkAccountIds.length > 0 && !bulkSameDate && (
            <Alert severity="warning">Selected accounts have different next closing dates.</Alert>
          )}
          {cashStatuses.length > 0 && (
            <TextField select size="small" label="Cash handover to" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} sx={{ maxWidth: 360 }}>
              {owners.map((owner) => <MenuItem key={owner.id} value={owner.id}>{owner.name}</MenuItem>)}
            </TextField>
          )}
          {totalDifference !== 0 && loadedBulkStatuses.length > 0 && (
            <FormControlLabel
              control={<Checkbox checked={postDifference} onChange={(event) => setPostDifference(event.target.checked)} />}
              label="Post differences so each book matches its counted balance"
            />
          )}
          {bulkAccountIds.length > 0 && (
            <TextField size="small" label="Common notes" value={bulkNotes} onChange={(event) => setBulkNotes(event.target.value)} multiline minRows={2} />
          )}
          <Button
            variant="contained"
            startIcon={<LockIcon />}
            disabled={!bulkAccountIds.length || !bulkReady || bulkLoading || !bulkSameDate || close.isPending}
            onClick={() => void submitBulk()}
            sx={{ alignSelf: 'flex-start' }}
          >
            Close {bulkAccountIds.length || ''} selected account{bulkAccountIds.length === 1 ? '' : 's'}
          </Button>
        </Stack>
      </Paper>

      {history.length > 0 && (
        <Paper variant="outlined" sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
            Past closes
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Day</TableCell>
                <TableCell>Account</TableCell>
                <TableCell>Number</TableCell>
                <TableCell align="right">Book</TableCell>
                <TableCell align="right">Counted</TableCell>
                <TableCell align="right">Difference</TableCell>
                <TableCell align="right">Handed over</TableCell>
                <TableCell align="right">Left</TableCell>
                <TableCell>Closed by</TableCell>
                <TableCell width={48}>&nbsp;</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((count) => (
                <TableRow key={count.id} hover sx={count.reopenedAt ? { opacity: 0.55 } : {}}>
                  <TableCell>{day(count.closeDate)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{count.accountName}</Typography>
                    <Typography variant="caption" color="text.secondary">{count.branchName ?? 'Company'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" fontFamily="monospace">
                        {count.countNo}
                      </Typography>
                      {count.reopenedAt && <Chip size="small" color="warning" label="Reopened" />}
                      {count.adjustmentEntryId && <Chip size="small" label="Adjusted" />}
                    </Stack>
                    {count.notes && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {count.notes}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{money(count.expectedBalance)}</TableCell>
                  <TableCell align="right">{money(count.countedAmount)}</TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      color={
                        count.variance === 0
                          ? 'success.main'
                          : count.variance < 0
                            ? 'error.main'
                            : 'warning.main'
                      }
                    >
                      {money(count.variance)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {count.handoverAmount > 0 ? (
                      <>
                        <Typography variant="body2">{money(count.handoverAmount)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {count.handoverAccountName}
                        </Typography>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="right">{money(count.retainedAmount)}</TableCell>
                  <TableCell>
                    <Typography variant="caption">{count.closedByName ?? '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    {!count.reopenedAt && (
                      <Tooltip title="Reopen this day">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setReopening(count);
                            setReason('');
                          }}
                        >
                          <LockOpenIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <VariancePanel />

      <Dialog open={Boolean(reopening)} onClose={() => setReopening(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reopen {reopening && day(reopening.closeDate)}?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              The day becomes writable again and the close stays on record, marked reopened.
              Any adjustment it wrote is undone with a contra entry.
            </Typography>
            {reopening?.adjustmentEntryId && (
              <Alert severity="info">
                This close adjusted the book by {money(reopening.variance)}. That will be
                reversed.
              </Alert>
            )}
            <TextField
              size="small"
              autoFocus
              label="Why"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Miscounted the 500s"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setReopening(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!reason.trim() || reopen.isPending}
            onClick={() => void confirmReopen()}
          >
            Reopen
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}

function CloseFigure({ label, value, color }: { label: string; value: number | null; color?: string }): JSX.Element {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body1" fontWeight={700} color={color}>{money(value)}</Typography>
    </Box>
  );
}
