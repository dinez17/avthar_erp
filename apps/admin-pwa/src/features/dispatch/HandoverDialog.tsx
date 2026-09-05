import {
  Alert,
  Button,
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
import type { DriverDueSummary } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useLedgerAccounts } from '../accounts/api';
import { useCreateHandover, useDriverDue } from './driver-cash-api';

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const today = (): string => new Date().toLocaleDateString('en-CA');

/**
 * Taking cash off a driver at the counter.
 *
 * The amount is one figure, not one per trip: a driver settling at the end of the day
 * hands over a single sum for three runs, and asking which note came from which trip is
 * theatre. The trips it clears are worked out oldest first and shown as they will be
 * applied, so the split is visible before it is saved.
 */
export function HandoverDialog({
  driver,
  branchId,
  onClose,
  onSaved,
}: {
  driver: DriverDueSummary | null;
  branchId: string;
  onClose: () => void;
  onSaved: (handoverNo: string, amount: number) => void;
}): JSX.Element {
  // The list row carries no trips, so the driver's own dues are read for the breakdown.
  const due = useDriverDue(driver?.driverId ?? null, branchId || undefined);
  const createHandover = useCreateHandover();
  const accounts = useLedgerAccounts();
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [handoverDate, setHandoverDate] = useState(today);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trips = due.data?.trips ?? driver?.trips ?? [];
  const balance = due.data?.balance ?? driver?.balance ?? 0;

  /**
   * The drawers this branch keeps. Notes go in a till, not a bank account — the driver is
   * standing at the counter handing over cash.
   */
  const drawers = useMemo(
    () =>
      (accounts.data ?? []).filter(
        (account) => account.type === 'CASH' && account.branchId === branchId,
      ),
    [accounts.data, branchId],
  );

  // A driver almost always hands over everything he is carrying, so start there.
  useEffect(() => {
    if (!driver) return;
    setAmount(String(driver.balance));
    setHandoverDate(today());
    setRemarks('');
    setError(null);
  }, [driver]);

  // Most branches keep one till, so there is nothing to choose.
  useEffect(() => {
    if (drawers.length === 1) setAccountId(drawers[0]!.id);
  }, [drawers]);

  const entered = Number(amount) || 0;
  const tooMuch = entered > balance + 0.005;

  /** The split as it will be applied: oldest trip first, same as the server does it. */
  let remaining = entered;
  const applied = trips.map((trip) => {
    const share = Math.min(trip.balance, Math.max(0, remaining));
    remaining = Math.round((remaining - share) * 100) / 100;
    return { trip, share: Math.round(share * 100) / 100 };
  });

  const submit = (): void => {
    if (!driver || entered <= 0 || tooMuch) return;
    setError(null);
    void (async () => {
      try {
        const created = await createHandover.mutateAsync({
          branchId,
          driverId: driver.driverId ?? undefined,
          driverName: driver.driverName,
          handoverDate: new Date(handoverDate).toISOString(),
          amount: entered,
          accountId: accountId || undefined,
          remarks: remarks.trim() || undefined,
        });
        onSaved(created.handoverNo, created.amount);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The handover could not be saved');
      }
    })();
  };

  useSaveShortcut(submit, driver !== null);

  return (
    <Dialog open={driver !== null} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Take cash from {driver?.driverName}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {!branchId && (
            <Alert severity="info">
              Choose a branch on the page behind this one — the handover is recorded against a
              branch.
            </Alert>
          )}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField
              label="Amount"
              size="small"
              type="number"
              autoFocus
              fullWidth={false}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={tooMuch}
              helperText={
                tooMuch ? `He is only carrying ${money(balance)}` : `Carrying ${money(balance)}`
              }
              inputProps={{ min: 0 }}
              sx={{ width: 170 }}
            />
            <TextField
              label="Date"
              type="date"
              size="small"
              fullWidth={false}
              InputLabelProps={{ shrink: true }}
              value={handoverDate}
              onChange={(e) => setHandoverDate(e.target.value)}
              sx={{ width: 170 }}
            />
            <TextField
              select
              label="Into drawer"
              size="small"
              fullWidth={false}
              value={drawers.some((drawer) => drawer.id === accountId) ? accountId : ''}
              onChange={(e) => setAccountId(e.target.value)}
              SelectProps={{ displayEmpty: true }}
              helperText={
                drawers.length === 0
                  ? 'No cash drawer set up for this branch'
                  : accountId
                    ? 'The notes go straight into its book'
                    : 'Not recorded in any cash book'
              }
              sx={{ width: 200 }}
            >
              <MenuItem value="">
                <Typography variant="body2" color="text.secondary">
                  Not recorded
                </Typography>
              </MenuItem>
              {drawers.map((drawer) => (
                <MenuItem key={drawer.id} value={drawer.id}>
                  {drawer.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Remarks"
              size="small"
              fullWidth={false}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              sx={{ flex: 1, minWidth: 180 }}
            />
          </Stack>

          <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Trip</TableCell>
                <TableCell>Customers</TableCell>
                <TableCell align="right">Outstanding</TableCell>
                <TableCell align="right">This settles</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {applied.map(({ trip, share }) => (
                <TableRow key={trip.gatePassId}>
                  <TableCell>
                    <Typography variant="body2">{trip.gatePassNo}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(trip.passDate).toLocaleDateString('en-IN')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {trip.customerNames.join(', ') || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{money(trip.balance)}</TableCell>
                  <TableCell align="right">
                    {share <= 0 ? (
                      '—'
                    ) : share >= trip.balance - 0.005 ? (
                      <Chip label={money(share)} size="small" color="success" />
                    ) : (
                      <Chip label={money(share)} size="small" color="warning" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Stack direction="row" spacing={3} justifyContent="flex-end">
            <Typography variant="body2" color="text.secondary">
              Left with the driver {money(Math.max(0, Math.round((balance - entered) * 100) / 100))}
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={entered <= 0 || tooMuch || !branchId || createHandover.isPending}
          onClick={submit}
        >
          Take {money(entered)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
