import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useSaveShortcut } from '@tiles-erp/ui';
import type { GatePassItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useGateOut } from './gate-pass-api';

/**
 * Letting the vehicle out, with the odometer read at the gate.
 *
 * The reading is taken here rather than asked of the driver later: a number written down
 * as the lorry passes is evidence, and one remembered at the end of the day is not.
 */
export function GateOutDialog({
  gatePass,
  onClose,
  onGatedOut,
}: {
  gatePass: GatePassItem | null;
  onClose: () => void;
  onGatedOut: (gatePassNo: string) => void;
}): JSX.Element {
  const gateOut = useGateOut();
  const [startKm, setStartKm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStartKm('');
    setError(null);
  }, [gatePass]);

  const submit = (): void => {
    if (!gatePass) return;
    setError(null);
    void (async () => {
      try {
        await gateOut.mutateAsync({
          id: gatePass.id,
          version: gatePass.version,
          startKm: startKm === '' ? undefined : Number(startKm),
        });
        onGatedOut(gatePass.gatePassNo);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The vehicle could not be gated out');
      }
    })();
  };

  useSaveShortcut(submit, gatePass !== null);

  return (
    <Dialog open={gatePass !== null} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Gate out — {gatePass?.gatePassNo}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="caption" color="text.secondary">
            {[
              gatePass?.vehicleNumber,
              gatePass?.driverName,
              gatePass?.customerNames.length
                ? `${gatePass.customerNames.length} drop${gatePass.customerNames.length === 1 ? '' : 's'}`
                : null,
              `${gatePass?.totalBoxes ?? 0} boxes`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
          <TextField
            label="Odometer"
            size="small"
            type="number"
            autoFocus
            value={startKm}
            onChange={(e) => setStartKm(e.target.value)}
            helperText="The reading as the vehicle leaves; the same is taken on the way back"
          />
          {gatePass && gatePass.freightToCollect > 0 && (
            <Alert severity="info">
              The driver has ₹
              {gatePass.freightToCollect.toLocaleString('en-IN', { maximumFractionDigits: 2 })} of
              freight to collect on this round.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={gateOut.isPending} onClick={submit}>
          Let it out
        </Button>
      </DialogActions>
    </Dialog>
  );
}
