import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useSaveShortcut } from '@tiles-erp/ui';
import type { DropSettlementInput, GatePassItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useCloseTrip, useGatePass } from './gate-pass-api';

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** What the desk typed against one drop while counting the driver in. */
interface Settlement {
  paidAtBranch: string;
  collected: string;
}

/**
 * Closing the trip when the vehicle comes back through the gate.
 *
 * Three things are recorded together because they belong together: the closing odometer,
 * what each drop actually settled, and the cash counted off the driver. Doing them as
 * separate steps would leave a trip half-closed the moment the desk got interrupted.
 */
export function CloseTripDialog({
  gatePass,
  onClose,
  onClosed,
}: {
  gatePass: GatePassItem | null;
  onClose: () => void;
  onClosed: (gatePassNo: string) => void;
}): JSX.Element {
  // The list row carries no drops, so the full pass is read for the settlement table.
  const detail = useGatePass(gatePass?.id ?? null);
  const closeTrip = useCloseTrip();
  const [endKm, setEndKm] = useState('');
  const [cash, setCash] = useState('');
  const [remarks, setRemarks] = useState('');
  const [settlements, setSettlements] = useState<Record<string, Settlement>>({});
  const [error, setError] = useState<string | null>(null);

  const pass = detail.data ?? gatePass;
  const documents = detail.data?.documents ?? [];

  /**
   * Each drop starts at what it was expected to settle — the driver was sent to collect
   * it, so assuming he did is the fast path, and correcting a figure is quicker than
   * typing every one.
   */
  useEffect(() => {
    if (!detail.data) return;
    setEndKm('');
    setRemarks('');
    setError(null);
    const seeded: Record<string, Settlement> = {};
    for (const document of detail.data.documents ?? []) {
      seeded[document.id] = {
        paidAtBranch: String(document.freightPaidAtBranch),
        collected: String(document.freightToCollect),
      };
    }
    setSettlements(seeded);
    setCash(String(detail.data.freightToCollect));
  }, [detail.data]);

  const set = (documentId: string, field: keyof Settlement, value: string): void =>
    setSettlements((current) => ({
      ...current,
      [documentId]: { paidAtBranch: '0', collected: '0', ...current[documentId], [field]: value },
    }));

  const collectedTotal =
    Math.round(
      documents.reduce(
        (sum, document) => sum + (Number(settlements[document.id]?.collected) || 0),
        0,
      ) * 100,
    ) / 100;
  const cashCounted = Number(cash) || 0;
  const variance = Math.round((cashCounted - collectedTotal) * 100) / 100;
  const startKm = pass?.startKm ?? null;
  const distance = startKm !== null && Number(endKm) > 0 ? Number(endKm) - startKm : null;
  const kmGoesBackwards = startKm !== null && endKm !== '' && Number(endKm) < startKm;

  const submit = (): void => {
    if (!pass || kmGoesBackwards) return;
    setError(null);
    void (async () => {
      try {
        const rows: DropSettlementInput[] = documents.map((document) => ({
          documentId: document.id,
          freightPaidAtBranch: Number(settlements[document.id]?.paidAtBranch) || 0,
          freightCollected: Number(settlements[document.id]?.collected) || 0,
        }));
        await closeTrip.mutateAsync({
          id: pass.id,
          version: pass.version,
          endKm: endKm === '' ? undefined : Number(endKm),
          cashHandedOver: cashCounted,
          closeRemarks: remarks.trim() || undefined,
          settlements: rows,
        });
        onClosed(pass.gatePassNo);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The trip could not be closed');
      }
    })();
  };

  useSaveShortcut(submit, gatePass !== null);

  return (
    <Dialog open={gatePass !== null} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Close trip — {pass?.gatePassNo}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <TextField
              label="Start km"
              size="small"
              fullWidth={false}
              value={pass?.startKm ?? '—'}
              InputProps={{ readOnly: true }}
              helperText="Read at the gate on the way out"
              sx={{ width: 150 }}
            />
            <TextField
              label="Closing km"
              size="small"
              type="number"
              autoFocus
              fullWidth={false}
              value={endKm}
              onChange={(e) => setEndKm(e.target.value)}
              error={kmGoesBackwards}
              helperText={
                kmGoesBackwards
                  ? 'Below the reading on the way out'
                  : distance !== null
                    ? `${distance} km this trip`
                    : 'Read at the gate on the way in'
              }
              sx={{ width: 170 }}
            />
            <TextField
              label="Cash handed over"
              size="small"
              type="number"
              fullWidth={false}
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              helperText="Counted at the desk"
              sx={{ width: 170 }}
            />
            <TextField
              label="Remarks"
              size="small"
              fullWidth={false}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Customer refused delivery at the third drop"
              sx={{ flex: 1, minWidth: 220 }}
            />
          </Stack>

          {documents.length > 0 && (
            <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Drop</TableCell>
                  <TableCell align="right">Charged</TableCell>
                  <TableCell align="right">On the invoice</TableCell>
                  <TableCell align="right" sx={{ width: 130 }}>
                    Paid at branch
                  </TableCell>
                  <TableCell align="right" sx={{ width: 130 }}>
                    Collected
                  </TableCell>
                  <TableCell align="right">Still due</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map((document, index) => {
                  const entry = settlements[document.id];
                  const paid = Number(entry?.paidAtBranch) || 0;
                  const collected = Number(entry?.collected) || 0;
                  const due = Math.max(
                    0,
                    Math.round(
                      (document.freightCharge - document.billedFreight - paid - collected) * 100,
                    ) / 100,
                  );
                  return (
                    <TableRow key={document.id} hover>
                      <TableCell>
                        <Typography variant="body2">
                          {document.sequence || index + 1}. {document.customerName ?? '—'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {document.documentNumber}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{money(document.freightCharge)}</TableCell>
                      <TableCell align="right">
                        {document.billedFreight > 0 ? money(document.billedFreight) : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          hiddenLabel
                          size="small"
                          type="number"
                          value={entry?.paidAtBranch ?? ''}
                          onChange={(e) => set(document.id, 'paidAtBranch', e.target.value)}
                          inputProps={{ min: 0, style: { textAlign: 'right', padding: 6 } }}
                          sx={{ width: 110 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          hiddenLabel
                          size="small"
                          type="number"
                          value={entry?.collected ?? ''}
                          onChange={(e) => set(document.id, 'collected', e.target.value)}
                          inputProps={{ min: 0, style: { textAlign: 'right', padding: 6 } }}
                          sx={{ width: 110 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {due > 0 ? (
                          <Chip label={money(due)} size="small" color="warning" />
                        ) : (
                          <Chip label="settled" size="small" variant="outlined" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <Stack direction="row" spacing={3} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" color="text.secondary">
              Collected on the round {money(collectedTotal)}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              Cash counted {money(cashCounted)}
            </Typography>
          </Stack>

          {variance !== 0 && (
            <Alert severity={variance < 0 ? 'warning' : 'info'}>
              {variance < 0
                ? `The driver is ${money(Math.abs(variance))} short of what the drops add up to.`
                : `The driver handed over ${money(variance)} more than the drops account for.`}{' '}
              The trip will still close — note why in the remarks.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={kmGoesBackwards || closeTrip.isPending}
          onClick={submit}
        >
          Close trip
        </Button>
      </DialogActions>
    </Dialog>
  );
}
