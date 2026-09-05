import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Button,
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
import { useEffect, useState } from 'react';
import type { CallDirection, CallDisposition, LeadItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useDeleteCall, useLeadCalls, useLogCall } from './calls-api';
import {
  DIRECTION_LABELS,
  DIRECTIONS,
  DISPOSITION_COLORS,
  DISPOSITION_LABELS,
  DISPOSITIONS,
  formatDuration,
} from './config';

interface Props {
  open: boolean;
  lead: LeadItem | null;
  onClose: () => void;
  onLogged: (message: string) => void;
}

const emptyForm = {
  direction: 'OUTBOUND' as CallDirection,
  disposition: 'CONNECTED' as CallDisposition,
  durationMin: '',
  callbackAt: '',
  notes: '',
};

/** Call history for a lead, plus a form to log the next call. */
export function CallLogDialog({ open, lead, onClose, onLogged }: Props): JSX.Element {
  const calls = useLeadCalls(open ? (lead?.id ?? null) : null);
  const logCall = useLogCall();
  const deleteCall = useDeleteCall();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError(null);
    }
  }, [open, lead]);

  const set = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isCallback = form.disposition === 'CALLBACK';

  const submit = async (): Promise<void> => {
    setError(null);
    if (!lead) return;
    if (isCallback && !form.callbackAt) {
      setError('Set the callback date and time');
      return;
    }
    try {
      const disposition = await logCall.mutateAsync({
        leadId: lead.id,
        direction: form.direction,
        disposition: form.disposition,
        durationSec: form.durationMin ? Math.round(Number(form.durationMin) * 60) : undefined,
        callbackAt: isCallback ? new Date(form.callbackAt).toISOString() : undefined,
        notes: form.notes.trim() || undefined,
      });
      setForm((prev) => ({ ...emptyForm, direction: prev.direction }));
      onLogged(
        `Call logged (${DISPOSITION_LABELS[disposition.disposition]})${
          isCallback ? ' — follow-up updated' : ''
        }.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const rows = calls.data?.items ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Calls · {lead?.companyName || lead?.name}
        {lead?.phone ? ` · ${lead.phone}` : ''}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="flex-start">
            <TextField
              select
              label="Disposition *"
              size="small"
              value={form.disposition}
              onChange={(e) => set('disposition', e.target.value as CallDisposition)}
              sx={{ width: 180 }}
            >
              {DISPOSITIONS.map((d) => (
                <MenuItem key={d} value={d}>
                  {DISPOSITION_LABELS[d]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Direction"
              size="small"
              value={form.direction}
              onChange={(e) => set('direction', e.target.value as CallDirection)}
              sx={{ width: 140 }}
            >
              {DIRECTIONS.map((d) => (
                <MenuItem key={d} value={d}>
                  {DIRECTION_LABELS[d]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Duration (min)"
              size="small"
              type="number"
              value={form.durationMin}
              onChange={(e) => set('durationMin', e.target.value)}
              sx={{ width: 130 }}
              inputProps={{ min: 0 }}
            />
            {isCallback && (
              <TextField
                label="Callback at *"
                type="datetime-local"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={form.callbackAt}
                onChange={(e) => set('callbackAt', e.target.value)}
                sx={{ width: 220 }}
                helperText="Sets the lead's next follow-up"
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <TextField
              label="Notes"
              size="small"
              fullWidth
              multiline
              minRows={1}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => void submit()}
              disabled={logCall.isPending}
              sx={{ mt: 0.25, whiteSpace: 'nowrap' }}
            >
              {logCall.isPending ? 'Logging…' : 'Log call'}
            </Button>
          </Stack>

          <Divider />

          <Typography variant="subtitle2">History</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Disposition</TableCell>
                <TableCell>Dir</TableCell>
                <TableCell>Caller</TableCell>
                <TableCell align="right">Duration</TableCell>
                <TableCell>Callback</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((call) => (
                <TableRow key={call.id}>
                  <TableCell>{new Date(call.calledAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Chip
                      label={DISPOSITION_LABELS[call.disposition]}
                      size="small"
                      color={DISPOSITION_COLORS[call.disposition]}
                    />
                  </TableCell>
                  <TableCell>{DIRECTION_LABELS[call.direction]}</TableCell>
                  <TableCell>{call.callerName ?? '—'}</TableCell>
                  <TableCell align="right">{formatDuration(call.durationSec)}</TableCell>
                  <TableCell>
                    {call.callbackAt ? new Date(call.callbackAt).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>{call.notes ?? '—'}</TableCell>
                  <TableCell>
                    <Tooltip title="Delete call">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => void deleteCall.mutateAsync(call.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary">
                      No calls logged yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
