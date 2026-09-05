import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EventBusyIcon from '@mui/icons-material/EventBusy';
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
import type { LeadItem, SalesVisitItem, VisitOutcome, VisitPurpose } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useSalesmen } from '../sales/api';
import { useCreateVisit, useDeleteVisit, useLeadVisits, useUpdateVisit } from './visits-api';
import {
  VISIT_OUTCOME_LABELS,
  VISIT_OUTCOMES,
  VISIT_PURPOSE_LABELS,
  VISIT_PURPOSES,
  VISIT_STATUS_COLORS,
  VISIT_STATUS_LABELS,
} from './config';

interface Props {
  open: boolean;
  lead: LeadItem | null;
  onClose: () => void;
  onChanged: (message: string) => void;
}

const emptyForm = {
  purpose: 'INTRODUCTION' as VisitPurpose,
  salespersonUserId: '',
  scheduledAt: '',
  location: '',
  notes: '',
};

const emptyComplete = {
  outcome: 'INTERESTED' as VisitOutcome,
  nextFollowUpAt: '',
  notes: '',
};

/** Schedule and report field visits against a lead. */
export function VisitDialog({ open, lead, onClose, onChanged }: Props): JSX.Element {
  const visits = useLeadVisits(open ? (lead?.id ?? null) : null);
  const salesmen = useSalesmen();
  const createVisit = useCreateVisit();
  const updateVisit = useUpdateVisit();
  const deleteVisit = useDeleteVisit();

  const [form, setForm] = useState(emptyForm);
  const [completing, setCompleting] = useState<SalesVisitItem | null>(null);
  const [complete, setComplete] = useState(emptyComplete);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError(null);
      setCompleting(null);
    }
  }, [open, lead]);

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    setError(null);
    try {
      await action();
      onChanged(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const schedule = (): void => {
    if (!lead) return;
    if (!form.scheduledAt) {
      setError('Pick a date and time for the visit');
      return;
    }
    void run(async () => {
      await createVisit.mutateAsync({
        leadId: lead.id,
        purpose: form.purpose,
        salespersonUserId: form.salespersonUserId || null,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setForm(emptyForm);
    }, 'Visit scheduled — lead follow-up updated.');
  };

  const submitComplete = (): void => {
    if (!completing) return;
    const visit = completing;
    void run(async () => {
      await updateVisit.mutateAsync({
        id: visit.id,
        version: visit.version,
        status: 'COMPLETED',
        outcome: complete.outcome,
        nextFollowUpAt: complete.nextFollowUpAt
          ? new Date(complete.nextFollowUpAt).toISOString()
          : undefined,
        notes: complete.notes.trim() || undefined,
      });
      setCompleting(null);
      setComplete(emptyComplete);
    }, 'Visit completed.');
  };

  const rows = visits.data?.items ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Visits · {lead?.companyName || lead?.name}
        {lead?.city ? ` · ${lead.city}` : ''}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Typography variant="subtitle2">Schedule a visit</Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="flex-start">
            <TextField
              select
              label="Purpose"
              size="small"
              value={form.purpose}
              onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value as VisitPurpose }))}
              sx={{ width: 200 }}
            >
              {VISIT_PURPOSES.map((v) => (
                <MenuItem key={v} value={v}>
                  {VISIT_PURPOSE_LABELS[v]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Salesperson"
              size="small"
              value={form.salespersonUserId}
              onChange={(e) => setForm((p) => ({ ...p, salespersonUserId: e.target.value }))}
              sx={{ width: 170 }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {(salesmen.data ?? []).map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="When *"
              type="datetime-local"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={form.scheduledAt}
              onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))}
              sx={{ width: 210 }}
            />
            <TextField
              label="Location"
              size="small"
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              sx={{ width: 200 }}
            />
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <TextField
              label="Notes"
              size="small"
              fullWidth
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
            <Button
              variant="contained"
              onClick={schedule}
              disabled={createVisit.isPending}
              sx={{ mt: 0.25, whiteSpace: 'nowrap' }}
            >
              {createVisit.isPending ? 'Saving…' : 'Schedule'}
            </Button>
          </Stack>

          <Divider />

          <Typography variant="subtitle2">History</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Purpose</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Outcome</TableCell>
                <TableCell>Salesperson</TableCell>
                <TableCell>Next</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((visit) => {
                const planned = visit.status === 'PLANNED';
                return (
                  <TableRow key={visit.id}>
                    <TableCell>{new Date(visit.scheduledAt).toLocaleString()}</TableCell>
                    <TableCell>{VISIT_PURPOSE_LABELS[visit.purpose]}</TableCell>
                    <TableCell>
                      <Chip
                        label={
                          visit.overdue ? 'Overdue' : VISIT_STATUS_LABELS[visit.status]
                        }
                        size="small"
                        color={visit.overdue ? 'error' : VISIT_STATUS_COLORS[visit.status]}
                        variant={visit.overdue ? 'outlined' : 'filled'}
                      />
                    </TableCell>
                    <TableCell>
                      {visit.outcome ? VISIT_OUTCOME_LABELS[visit.outcome] : '—'}
                    </TableCell>
                    <TableCell>{visit.salespersonName ?? '—'}</TableCell>
                    <TableCell>
                      {visit.nextFollowUpAt
                        ? new Date(visit.nextFollowUpAt).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {planned && (
                        <>
                          <Tooltip title="Mark completed">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => {
                                setCompleting(visit);
                                setComplete(emptyComplete);
                              }}
                            >
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Cancel visit">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() =>
                                void run(
                                  () =>
                                    updateVisit.mutateAsync({
                                      id: visit.id,
                                      version: visit.version,
                                      status: 'CANCELLED',
                                    }),
                                  'Visit cancelled.',
                                )
                              }
                            >
                              <EventBusyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() =>
                            void run(() => deleteVisit.mutateAsync(visit.id), 'Visit deleted.')
                          }
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary">
                      No visits yet.
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

      <Dialog open={completing !== null} onClose={() => setCompleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Complete visit</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField
              select
              label="Outcome *"
              size="small"
              value={complete.outcome}
              onChange={(e) =>
                setComplete((p) => ({ ...p, outcome: e.target.value as VisitOutcome }))
              }
            >
              {VISIT_OUTCOMES.map((o) => (
                <MenuItem key={o} value={o}>
                  {VISIT_OUTCOME_LABELS[o]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Next follow-up"
              type="datetime-local"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={complete.nextFollowUpAt}
              onChange={(e) => setComplete((p) => ({ ...p, nextFollowUpAt: e.target.value }))}
              helperText="Writes the lead's follow-up date"
            />
            <TextField
              label="Notes"
              size="small"
              multiline
              minRows={2}
              value={complete.notes}
              onChange={(e) => setComplete((p) => ({ ...p, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setCompleting(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitComplete} disabled={updateVisit.isPending}>
            Complete
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
