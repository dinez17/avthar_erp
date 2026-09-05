import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { CampaignChannel, CampaignStatus, CreateCampaignInput } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useCampaign, useCreateCampaign, useUpdateCampaign } from './campaigns-api';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  CHANNEL_LABELS,
} from './config';

interface FormState {
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  budget: string;
  startDate: string;
  endDate: string;
  objective: string;
  notes: string;
}

const emptyForm: FormState = {
  name: '',
  channel: 'PHONE',
  status: 'DRAFT',
  budget: '',
  startDate: '',
  endDate: '',
  objective: '',
  notes: '',
};

interface Props {
  open: boolean;
  /** Null to create; an id to edit (the full campaign is fetched for its version). */
  campaignId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function CampaignFormDialog({ open, campaignId, onClose, onSaved }: Props): JSX.Element {
  const editing = useCampaign(open ? campaignId : null);
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (campaignId && editing.data) {
      const c = editing.data;
      setForm({
        name: c.name,
        channel: c.channel,
        status: c.status,
        budget: c.budget ? String(c.budget) : '',
        startDate: c.startDate ? c.startDate.slice(0, 10) : '',
        endDate: c.endDate ? c.endDate.slice(0, 10) : '',
        objective: c.objective ?? '',
        notes: c.notes ?? '',
      });
    } else if (!campaignId) {
      setForm(emptyForm);
    }
    setError(null);
  }, [open, campaignId, editing.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (): Promise<void> => {
    setError(null);
    if (form.name.trim().length < 2) {
      setError('A campaign name is required');
      return;
    }
    const payload: CreateCampaignInput = {
      name: form.name.trim(),
      channel: form.channel,
      status: form.status,
      budget: form.budget ? Number(form.budget) : 0,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      objective: form.objective.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (campaignId && editing.data) {
        await updateCampaign.mutateAsync({ id: campaignId, version: editing.data.version, ...payload });
        onSaved(`${editing.data.code} updated.`);
      } else {
        const created = await createCampaign.mutateAsync(payload);
        onSaved(`${created.code} created.`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const pending = createCampaign.isPending || updateCampaign.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{campaignId ? 'Edit campaign' : 'New campaign'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <TextField
            label="Name *"
            size="small"
            fullWidth
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Channel"
              size="small"
              fullWidth
              value={form.channel}
              onChange={(e) => set('channel', e.target.value as CampaignChannel)}
            >
              {CAMPAIGN_CHANNELS.map((c) => (
                <MenuItem key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Status"
              size="small"
              fullWidth
              value={form.status}
              onChange={(e) => set('status', e.target.value as CampaignStatus)}
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {CAMPAIGN_STATUS_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Budget (₹)"
              size="small"
              fullWidth
              type="number"
              value={form.budget}
              onChange={(e) => set('budget', e.target.value)}
              inputProps={{ min: 0 }}
            />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Start date"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
            <TextField
              label="End date"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={form.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
          </Stack>
          <TextField
            label="Objective"
            size="small"
            fullWidth
            value={form.objective}
            onChange={(e) => set('objective', e.target.value)}
          />
          <TextField
            label="Notes"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={pending}>
          {pending ? 'Saving…' : campaignId ? 'Save changes' : 'Create campaign'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
