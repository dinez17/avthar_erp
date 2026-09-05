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
import type { CreateLeadInput, LeadItem, LeadSource, LeadStage } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useCustomers, useSalesmen } from '../sales/api';
import { useCreateLead, useUpdateLead } from './api';
import { useCampaignOptions } from './campaigns-api';
import { INITIAL_STAGES, SOURCES, SOURCE_LABELS, STAGE_LABELS } from './config';

interface FormState {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  city: string;
  source: LeadSource;
  stage: LeadStage;
  ownerUserId: string;
  branchId: string;
  customerId: string;
  campaignId: string;
  expectedValue: string;
  nextFollowUpAt: string;
  notes: string;
}

const emptyForm: FormState = {
  name: '',
  companyName: '',
  phone: '',
  email: '',
  city: '',
  source: 'WALK_IN',
  stage: 'NEW',
  ownerUserId: '',
  branchId: '',
  customerId: '',
  campaignId: '',
  expectedValue: '',
  nextFollowUpAt: '',
  notes: '',
};

const fromLead = (lead: LeadItem): FormState => ({
  name: lead.name,
  companyName: lead.companyName ?? '',
  phone: lead.phone ?? '',
  email: lead.email ?? '',
  city: lead.city ?? '',
  source: lead.source,
  stage: lead.stage,
  ownerUserId: lead.ownerUserId ?? '',
  branchId: lead.branchId ?? '',
  customerId: lead.customerId ?? '',
  campaignId: lead.campaignId ?? '',
  expectedValue: lead.expectedValue ? String(lead.expectedValue) : '',
  nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : '',
  notes: lead.notes ?? '',
});

interface Props {
  open: boolean;
  lead: LeadItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Create a new lead or edit an existing one. Stage moves happen elsewhere. */
export function LeadFormDialog({ open, lead, onClose, onSaved }: Props): JSX.Element {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const customers = useCustomers();
  const salesmen = useSalesmen();
  const branches = useBranches();
  const campaigns = useCampaignOptions();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();

  useEffect(() => {
    if (open) {
      setForm(lead ? fromLead(lead) : emptyForm);
      setError(null);
    }
  }, [open, lead]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (): Promise<void> => {
    setError(null);
    if (form.name.trim().length < 2) {
      setError('A lead name is required');
      return;
    }
    // Send nulls for cleared optional links so the server unsets them.
    const payload: CreateLeadInput = {
      name: form.name.trim(),
      companyName: form.companyName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      city: form.city.trim() || undefined,
      source: form.source,
      ownerUserId: form.ownerUserId || null,
      branchId: form.branchId || null,
      customerId: form.customerId || null,
      campaignId: form.campaignId || null,
      expectedValue: form.expectedValue ? Number(form.expectedValue) : 0,
      nextFollowUpAt: form.nextFollowUpAt
        ? new Date(form.nextFollowUpAt).toISOString()
        : null,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (lead) {
        await updateLead.mutateAsync({ id: lead.id, version: lead.version, ...payload });
        onSaved(`${lead.code} updated.`);
      } else {
        const created = await createLead.mutateAsync({ ...payload, stage: form.stage });
        onSaved(`${created.code} created.`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const pending = createLead.isPending || updateLead.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{lead ? `Edit ${lead.code}` : 'New lead'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Contact name *"
              size="small"
              fullWidth
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <TextField
              label="Company"
              size="small"
              fullWidth
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
            />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Phone"
              size="small"
              fullWidth
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
            <TextField
              label="Email"
              size="small"
              fullWidth
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
            <TextField
              label="City"
              size="small"
              fullWidth
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
            />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Source"
              size="small"
              fullWidth
              value={form.source}
              onChange={(e) => set('source', e.target.value as LeadSource)}
            >
              {SOURCES.map((s) => (
                <MenuItem key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            {!lead && (
              <TextField
                select
                label="Stage"
                size="small"
                fullWidth
                value={form.stage}
                onChange={(e) => set('stage', e.target.value as LeadStage)}
              >
                {INITIAL_STAGES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="Expected value"
              size="small"
              fullWidth
              type="number"
              value={form.expectedValue}
              onChange={(e) => set('expectedValue', e.target.value)}
            />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Salesman"
              size="small"
              fullWidth
              value={form.ownerUserId}
              onChange={(e) => set('ownerUserId', e.target.value)}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {(salesmen.data ?? []).map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Branch"
              size="small"
              fullWidth
              value={form.branchId}
              onChange={(e) => set('branchId', e.target.value)}
              helperText="Needed before the lead can be quoted"
            >
              <MenuItem value="">None yet</MenuItem>
              {(branches.data ?? []).map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              label="Customer (if known)"
              size="small"
              fullWidth
              value={form.customerId}
              onChange={(e) => set('customerId', e.target.value)}
            >
              <MenuItem value="">Not a customer yet</MenuItem>
              {(customers.data ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ''}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Next follow-up"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={form.nextFollowUpAt}
              onChange={(e) => set('nextFollowUpAt', e.target.value)}
            />
          </Stack>
          <TextField
            select
            label="Campaign"
            size="small"
            fullWidth
            value={form.campaignId}
            onChange={(e) => set('campaignId', e.target.value)}
            helperText="Attribute this lead to a marketing campaign"
          >
            <MenuItem value="">No campaign</MenuItem>
            {(campaigns.data ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
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
          {pending ? 'Saving…' : lead ? 'Save changes' : 'Create lead'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
