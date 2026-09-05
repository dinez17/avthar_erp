import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
  handoverProblem,
  hasCounted,
  varianceVerdict,
  type DenominationCounts,
} from '@tiles-erp/shared';
import type { CashCountItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { VariancePanel } from './VariancePanel';
import {
  useCashCounts,
  useCloseDay,
  useDayCloseStatus,
  useLedgerAccounts,
  useReopenDay,
} from './api';

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
  const [accountId, setAccountId] = useState('');
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [typedTotal, setTypedTotal] = useState('');
  const [postDifference, setPostDifference] = useState(true);
  const [handover, setHandover] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [handoverTouched, setHandoverTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [reopening, setReopening] = useState<CashCountItem | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: accounts = [] } = useLedgerAccounts();
  const { data: status } = useDayCloseStatus(accountId);
  const { data: history = [] } = useCashCounts(accountId || undefined);
  const close = useCloseDay();
  const reopen = useReopenDay();

  /**
   * Only tills and bank accounts are closed. An owner's holding is not counted at the end
   * of a day — nobody is standing over it — so offering it here would invite locking an
   * account that never needed locking.
   */
  const closeable = useMemo(
    () => accounts.filter((account) => account.type !== 'OWNER'),
    [accounts],
  );

  useEffect(() => {
    if (!accountId && closeable.length > 0) setAccountId(closeable[0]!.id);
  }, [closeable, accountId]);

  // A fresh account means a fresh count. Carrying the previous drawer's notes over would
  // be worse than starting blank.
  useEffect(() => {
    setCounts({});
    setTypedTotal('');
    setNotes('');
    setHandover('');
    setHandoverTouched(false);
    setError(null);
  }, [accountId]);

  const isCash = status?.accountType === 'CASH';
  const countedAmount = isCash ? denominationTotal(counts) : Number(typedTotal) || 0;
  const expected = status?.expectedBalance ?? 0;
  const variance = Math.round((countedAmount - expected) * 100) / 100;
  const verdict = varianceVerdict(variance);
  const ready = isCash ? hasCounted(counts) : typedTotal.trim() !== '';

  const setCount = (denomination: number, value: string): void => {
    setCounts((previous) => ({ ...previous, [denomination]: Math.max(0, Number(value) || 0) }));
    setHandoverTouched(false);
  };

  const owners = useMemo(
    () => accounts.filter((account) => account.type === 'OWNER'),
    [accounts],
  );

  /**
   * What the drawer would hand over, left alone once someone types their own figure.
   *
   * Recomputing over a typed amount every time a note is counted would fight the person
   * doing the counting, and they have the envelope in their hand.
   */
  const suggested = handoverPlan(countedAmount, status?.retainedFloat ?? 0);
  const handoverAmount = handoverTouched ? Number(handover) || 0 : suggested.handover;
  const retained = Math.round((countedAmount - handoverAmount) * 100) / 100;
  const handoverIssue = handoverProblem(handoverAmount, countedAmount, ownerId || null);

  useEffect(() => {
    if (owners.length === 1 && !ownerId) setOwnerId(owners[0]!.id);
  }, [owners, ownerId]);

  const totalNotes = useMemo(
    () => DENOMINATIONS.reduce((sum, d) => sum + (counts[d] ?? 0), 0),
    [counts],
  );

  const submit = async (): Promise<void> => {
    if (!status) return;
    setError(null);
    try {
      const saved = await close.mutateAsync({
        accountId: status.accountId,
        closeDate: status.nextCloseDate,
        countedAmount,
        denominations: isCash ? (counts as Record<string, number>) : undefined,
        postDifference,
        handoverAmount: handoverAmount > 0 ? handoverAmount : undefined,
        handoverAccountId: handoverAmount > 0 ? ownerId : undefined,
        notes: notes.trim() || undefined,
      });
      setNote(
        [
          `${saved.countNo} closed ${day(saved.closeDate)}`,
          saved.variance === 0
            ? 'and balanced'
            : `with ${money(Math.abs(saved.variance))} ${saved.variance < 0 ? 'short' : 'over'}`,
          saved.handoverAmount > 0
            ? `· ${money(saved.handoverAmount)} to ${saved.handoverAccountName}, ${money(saved.retainedAmount)} left in the drawer`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      setCounts({});
      setTypedTotal('');
      setNotes('');
      setHandover('');
      setHandoverTouched(false);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not close that day');
    }
  };

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
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <TextField
            select
            size="small"
            label="Account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            sx={{ minWidth: 280 }}
          >
            {closeable.map((account) => (
              <MenuItem key={account.id} value={account.id}>
                {account.name}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {account.branchName ?? 'Company'}
                </Typography>
              </MenuItem>
            ))}
          </TextField>

          {status && (
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                icon={<LockIcon fontSize="small" />}
                size="small"
                label={
                  status.lastCloseDate
                    ? `Locked to ${day(status.lastCloseDate)}`
                    : 'Never counted'
                }
              />
              <Typography variant="body2">
                Closing <strong>{day(status.nextCloseDate)}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {status.movementCount} movement{status.movementCount === 1 ? '' : 's'} that day
              </Typography>
            </Stack>
          )}
        </Stack>
      </Paper>

      {status && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              {isCash ? 'Count the drawer' : 'What the statement shows'}
            </Typography>
            <Divider sx={{ mb: 1.5 }} />

            {isCash ? (
              <>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Note</TableCell>
                      <TableCell align="right" width={110}>
                        Count
                      </TableCell>
                      <TableCell align="right">Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {DENOMINATIONS.map((denomination) => {
                      const quantity = counts[denomination] ?? 0;
                      return (
                        <TableRow key={denomination} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>
                              ₹{denomination}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              value={quantity || ''}
                              onChange={(event) => setCount(denomination, event.target.value)}
                              inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                              sx={{ width: 90 }}
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color={quantity ? 'text.primary' : 'text.disabled'}>
                              {money(denomination * quantity)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          Counted
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption" color="text.secondary">
                          {totalNotes} pcs
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700}>
                          {money(countedAmount)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Typography variant="caption" color="text.secondary">
                  The total is what the notes add up to — it cannot be typed over. That is
                  the point of counting.
                </Typography>
              </>
            ) : (
              <Stack spacing={2}>
                <TextField
                  size="small"
                  label="Closing balance on the statement"
                  value={typedTotal}
                  onChange={(event) => setTypedTotal(event.target.value)}
                  inputProps={{ inputMode: 'decimal' }}
                />
                <Typography variant="caption" color="text.secondary">
                  A bank account has no notes to count, so it is reconciled against the
                  statement instead.
                </Typography>
              </Stack>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Against the book
            </Typography>
            <Divider sx={{ mb: 1.5 }} />

            <Stack spacing={1.5}>
              <Line label="The book says" value={expected} />
              <Line label="Counted" value={countedAmount} />
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Difference
                </Typography>
                <Typography
                  variant="h5"
                  fontWeight={700}
                  color={
                    !ready
                      ? 'text.disabled'
                      : verdict === 'BALANCED'
                        ? 'success.main'
                        : verdict === 'SHORT'
                          ? 'error.main'
                          : 'warning.main'
                  }
                >
                  {ready ? money(variance) : '—'}
                </Typography>
                {ready && (
                  <Typography variant="caption" color="text.secondary">
                    {verdict === 'BALANCED'
                      ? 'The drawer agrees with the book.'
                      : verdict === 'SHORT'
                        ? 'The drawer holds less than the book says — money left without a record.'
                        : 'The drawer holds more than the book says — money arrived without one.'}
                  </Typography>
                )}
              </Box>

              {ready && verdict !== 'BALANCED' && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={postDifference}
                      onChange={(event) => setPostDifference(event.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">Post the difference</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Writes an adjusting entry so the book matches the count. Leave it off
                        while someone is still looking for the missing note.
                      </Typography>
                    </Box>
                  }
                />
              )}

              {isCash && ready && (
                <>
                  <Divider />
                  <Typography variant="subtitle2">Hand over the takings</Typography>

                  {owners.length === 0 ? (
                    <Alert severity="info">
                      No owners are set up yet. Add them under <strong>Cash &amp; bank</strong> as
                      accounts of type <strong>Owner</strong>, and the day's takings can go to one
                      of them at close.
                    </Alert>
                  ) : (
                    <>
                      <Stack direction="row" spacing={2}>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          label="To"
                          value={ownerId}
                          onChange={(event) => setOwnerId(event.target.value)}
                        >
                          {owners.map((owner) => (
                            <MenuItem key={owner.id} value={owner.id}>
                              {owner.name}
                              <Typography
                                component="span"
                                variant="caption"
                                color="text.secondary"
                                sx={{ ml: 1 }}
                              >
                                holding {money(owner.currentBalance)}
                              </Typography>
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          size="small"
                          fullWidth
                          label="Amount"
                          value={handoverTouched ? handover : String(suggested.handover)}
                          onChange={(event) => {
                            setHandover(event.target.value);
                            setHandoverTouched(true);
                          }}
                          inputProps={{ inputMode: 'decimal' }}
                          error={Boolean(handoverIssue)}
                          helperText={handoverIssue ?? ' '}
                        />
                      </Stack>

                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="baseline"
                      >
                        <Typography variant="body2" color="text.secondary">
                          The drawer opens tomorrow with
                        </Typography>
                        <Typography variant="h6" fontWeight={700}>
                          {money(retained)}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {status.retainedFloat > 0
                          ? `This drawer keeps ${money(status.retainedFloat)} back, rounded up to a note it can actually hand over. Change the amount if tonight is different.`
                          : 'This drawer keeps nothing back. Set a float on the account if it needs change in the morning.'}
                      </Typography>
                    </>
                  )}
                </>
              )}

              <TextField
                size="small"
                multiline
                minRows={2}
                label="Notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={
                  verdict === 'BALANCED'
                    ? 'Anything worth remembering about today'
                    : 'What you think happened'
                }
              />

              <Button
                variant="contained"
                startIcon={<LockIcon />}
                disabled={!ready || Boolean(handoverIssue) || close.isPending}
                onClick={() => void submit()}
              >
                Close {day(status.nextCloseDate)}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Once closed, nothing can be dated on or before that day without reopening it.
              </Typography>
            </Stack>
          </Paper>
        </Stack>
      )}

      {history.length > 0 && (
        <Paper variant="outlined" sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
            Past closes
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Day</TableCell>
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

function Line({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1">{money(value)}</Typography>
    </Stack>
  );
}
