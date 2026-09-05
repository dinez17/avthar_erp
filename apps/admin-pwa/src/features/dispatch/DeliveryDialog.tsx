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
import { useDeliverGatePass } from './gate-pass-api';

/** `datetime-local` wants the local clock without a zone, which toISOString will not give. */
const localNow = (): string => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

/**
 * Proof of delivery: who signed for the goods and when.
 *
 * The name is required rather than optional — a pass with no name against it is not proof
 * of anything, which is the whole reason the step exists.
 */
export function DeliveryDialog({
  gatePass,
  onClose,
  onDelivered,
}: {
  gatePass: GatePassItem | null;
  onClose: () => void;
  onDelivered: (gatePassNo: string) => void;
}): JSX.Element {
  const deliver = useDeliverGatePass();
  const [receivedByName, setReceivedByName] = useState('');
  const [receivedByPhone, setReceivedByPhone] = useState('');
  const [deliveredAt, setDeliveredAt] = useState(localNow);
  const [podRemarks, setPodRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A fresh pass starts from a clean form, defaulted to the customer on the pass.
  useEffect(() => {
    if (!gatePass) return;
    setReceivedByName(gatePass.customerName ?? '');
    setReceivedByPhone('');
    setDeliveredAt(localNow());
    setPodRemarks('');
    setError(null);
  }, [gatePass]);

  const submit = (): void => {
    if (!gatePass || receivedByName.trim().length < 2) return;
    setError(null);
    void (async () => {
      try {
        await deliver.mutateAsync({
          id: gatePass.id,
          version: gatePass.version,
          receivedByName: receivedByName.trim(),
          receivedByPhone: receivedByPhone.trim() || undefined,
          deliveredAt: new Date(deliveredAt).toISOString(),
          podRemarks: podRemarks.trim() || undefined,
        });
        onDelivered(gatePass.gatePassNo);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The delivery could not be recorded');
      }
    })();
  };

  useSaveShortcut(submit, gatePass !== null);

  return (
    <Dialog open={gatePass !== null} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Proof of delivery — {gatePass?.gatePassNo}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="caption" color="text.secondary">
            {[gatePass?.customerName ?? gatePass?.toBranchName, gatePass?.destination]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
          <TextField
            label="Received by"
            size="small"
            autoFocus
            required
            value={receivedByName}
            onChange={(e) => setReceivedByName(e.target.value)}
            helperText="The name of whoever signed for the goods"
          />
          <TextField
            label="Phone"
            size="small"
            value={receivedByPhone}
            onChange={(e) => setReceivedByPhone(e.target.value)}
          />
          <TextField
            label="Delivered at"
            type="datetime-local"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={deliveredAt}
            onChange={(e) => setDeliveredAt(e.target.value)}
          />
          <TextField
            label="Remarks"
            size="small"
            multiline
            minRows={2}
            value={podRemarks}
            onChange={(e) => setPodRemarks(e.target.value)}
            placeholder="Two boxes found damaged on arrival"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={receivedByName.trim().length < 2 || deliver.isPending}
          onClick={submit}
        >
          Record delivery
        </Button>
      </DialogActions>
    </Dialog>
  );
}
