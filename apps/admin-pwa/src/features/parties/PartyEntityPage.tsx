import { zodResolver } from '@hookform/resolvers/zod';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { GST_STATES } from '@tiles-erp/config';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { CustomerType, PartyItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { NO_AUTOFILL } from '../../components/noAutofill';
import { ApiError } from '../../lib/api-client';
import {
  useCreateParty,
  useDeleteParty,
  useNextPartyCode,
  useParties,
  useUpdateParty,
} from './api';
import type { PartyEntityConfig } from './config';

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;
const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/;

const CUSTOMER_TYPES: { value: CustomerType; label: string }[] = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DEALER', label: 'Dealer' },
  { value: 'PROJECT', label: 'Project' },
];

interface PartyFormValues {
  code: string;
  name: string;
  type: CustomerType;
  gstin: string;
  panNumber: string;
  contactPerson: string;
  phone: string;
  altPhone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateCode: string;
  pincode: string;
  creditDays: number;
  creditLimit: number;
  paymentTermDays: number;
  openingBalance: number;
  notes: string;
  isActive: boolean;
}

const emptyValues: PartyFormValues = {
  code: '',
  name: '',
  type: 'RETAIL',
  gstin: '',
  panNumber: '',
  contactPerson: '',
  phone: '',
  altPhone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  stateCode: '',
  pincode: '',
  creditDays: 0,
  creditLimit: 0,
  paymentTermDays: 0,
  openingBalance: 0,
  notes: '',
  isActive: true,
};

const optional = (regex: RegExp, message: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || regex.test(v), message);

const buildPartySchema = (requiresPhone: boolean) =>
  z
    .object({
      code: z.string().trim().max(32),
      name: z.string().trim().min(2, 'At least 2 characters').max(200),
      type: z.enum(['RETAIL', 'WHOLESALE', 'DEALER', 'PROJECT']),
      gstin: optional(GSTIN_REGEX, 'Invalid GSTIN'),
      panNumber: optional(PAN_REGEX, 'Invalid PAN'),
      contactPerson: z.string().trim().max(120),
      phone: z
        .string()
        .trim()
        .refine(
          (v) => (requiresPhone ? /^[+]?\d{7,15}$/.test(v) : v === '' || /^[+]?\d{7,15}$/.test(v)),
          requiresPhone ? 'Phone number is required (7-15 digits)' : 'Must be 7-15 digits',
        ),
      altPhone: z
        .string()
        .trim()
        .refine((v) => v === '' || /^[+]?\d{7,15}$/.test(v), 'Must be 7-15 digits'),
      email: z
        .string()
        .trim()
        .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Invalid email'),
      addressLine1: z.string().trim().max(200),
      addressLine2: z.string().trim().max(200),
      city: z.string().trim().max(100),
      stateCode: z
        .string()
        .refine((v) => v === '' || GST_STATES.some((s) => s.code === v), 'Select a valid state'),
      pincode: z
        .string()
        .trim()
        .refine((v) => v === '' || /^\d{6}$/.test(v), 'Must be 6 digits'),
      creditDays: z.coerce.number().int().min(0),
      creditLimit: z.coerce.number().min(0),
      paymentTermDays: z.coerce.number().int().min(0),
      openingBalance: z.coerce.number(),
      notes: z.string().trim().max(1000),
      isActive: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (
        values.gstin !== '' &&
        values.stateCode !== '' &&
        !values.gstin.startsWith(values.stateCode)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gstin'],
          message: `GSTIN must start with state code ${values.stateCode}`,
        });
      }
    });

/** Management page shared by the Customers and Suppliers masters. */
export function PartyEntityPage({ config }: { config: PartyEntityConfig }): JSX.Element {
  const isCustomer = config.kind === 'customer';
  const pagination = usePagination();
  const [stateFilter, setStateFilter] = useState('');
  const { data, isFetching } = useParties(config.endpoint, pagination.query, stateFilter || undefined);
  const createParty = useCreateParty(config.endpoint);
  const updateParty = useUpdateParty(config.endpoint);
  const deleteParty = useDeleteParty(config.endpoint);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartyItem | null>(null);
  const [deleting, setDeleting] = useState<PartyItem | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const nextCode = useNextPartyCode(config.endpoint, dialogOpen && editing === null);

  const schema = useMemo(() => buildPartySchema(config.requiresPhone), [config.requiresPhone]);
  const form = useForm<PartyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (dialogOpen && !editing && nextCode.data && !form.getValues('code')) {
      form.setValue('code', nextCode.data);
    }
  }, [dialogOpen, editing, nextCode.data, form]);

  const openCreate = (): void => {
    setEditing(null);
    setServerError(null);
    form.reset(emptyValues);
    setDialogOpen(true);
  };

  const openEdit = (party: PartyItem): void => {
    setEditing(party);
    setServerError(null);
    form.reset({
      code: party.code,
      name: party.name,
      type: party.type ?? 'RETAIL',
      gstin: party.gstin ?? '',
      panNumber: party.panNumber ?? '',
      contactPerson: party.contactPerson ?? '',
      phone: party.phone ?? '',
      altPhone: party.altPhone ?? '',
      email: party.email ?? '',
      addressLine1: party.addressLine1 ?? '',
      addressLine2: party.addressLine2 ?? '',
      city: party.city ?? '',
      stateCode: party.stateCode ?? '',
      pincode: party.pincode ?? '',
      creditDays: party.creditDays ?? 0,
      creditLimit: party.creditLimit ?? 0,
      paymentTermDays: party.paymentTermDays ?? 0,
      openingBalance: party.openingBalance,
      notes: party.notes ?? '',
      isActive: party.isActive,
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const payload = {
      code: values.code || undefined,
      name: values.name,
      gstin: values.gstin || undefined,
      panNumber: values.panNumber || undefined,
      contactPerson: values.contactPerson || undefined,
      phone: values.phone || undefined,
      altPhone: values.altPhone || undefined,
      email: values.email || undefined,
      addressLine1: values.addressLine1 || undefined,
      addressLine2: values.addressLine2 || undefined,
      city: values.city || undefined,
      stateCode: values.stateCode || undefined,
      pincode: values.pincode || undefined,
      openingBalance: values.openingBalance,
      notes: values.notes || undefined,
      isActive: values.isActive,
      ...(isCustomer
        ? { type: values.type, creditDays: values.creditDays, creditLimit: values.creditLimit }
        : { paymentTermDays: values.paymentTermDays }),
    };
    try {
      if (editing) {
        await updateParty.mutateAsync({ id: editing.id, ...payload, version: editing.version });
      } else {
        await createParty.mutateAsync(payload);
      }
      setDialogOpen(false);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  const columns = useMemo<ColDef<PartyItem>[]>(() => {
    const cols: ColDef<PartyItem>[] = [
      { field: 'code', headerName: 'Code', maxWidth: 140 },
      { field: 'name', headerName: 'Name', minWidth: 200 },
    ];
    if (isCustomer) cols.push({ field: 'type', headerName: 'Type', maxWidth: 120 });
    cols.push(
      { field: 'phone', headerName: 'Phone', maxWidth: 140 },
      { field: 'city', headerName: 'City', maxWidth: 130 },
      { field: 'gstin', headerName: 'GSTIN', minWidth: 170 },
    );
    if (isCustomer) {
      cols.push(
        { field: 'creditDays', headerName: 'Cr. days', maxWidth: 110 },
        { field: 'creditLimit', headerName: 'Cr. limit ₹', maxWidth: 130 },
      );
    } else {
      cols.push({ field: 'paymentTermDays', headerName: 'Pay days', maxWidth: 120 });
    }
    cols.push(
      {
        field: 'isActive',
        headerName: 'Status',
        maxWidth: 110,
        cellRenderer: (p: ICellRendererParams<PartyItem>) => (
          <Chip
            label={p.data?.isActive ? 'Active' : 'Inactive'}
            color={p.data?.isActive ? 'success' : 'default'}
            size="small"
          />
        ),
      },
      {
        headerName: '',
        maxWidth: 100,
        cellRenderer: (p: ICellRendererParams<PartyItem>) => (
          <>
            <IconButton size="small" aria-label="Edit" onClick={() => p.data && openEdit(p.data)}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Delete"
              onClick={() => p.data && setDeleting(p.data)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </>
        ),
      },
    );
    return cols;
  }, [isCustomer]);

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void onSubmit(), dialogOpen);

  return (
    <PageContainer
      title={config.title}
      subtitle={config.subtitle}
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New {config.singular}
        </Button>
      }
    >
      <Stack spacing={1}>
        <TextField
          select
          label="State"
          size="small"
          fullWidth={false}
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value);
            pagination.setPage(1);
          }}
          sx={{ width: 200 }}
        >
          <MenuItem value="">All states</MenuItem>
          {GST_STATES.map((state) => (
            <MenuItem key={state.code} value={state.code}>
              {state.name}
            </MenuItem>
          ))}
        </TextField>

        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by name, code, phone, GSTIN or city…"
          height={620}
        />
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.name}` : `Create ${config.singular}`}</DialogTitle>
        <form onSubmit={onSubmit} noValidate autoComplete="off">
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {serverError && <Alert severity="error">{serverError}</Alert>}

              <Typography variant="subtitle2">Identity</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Code"
                  helperText={editing ? undefined : 'Auto-generated; edit if you use your own codes'}
                  {...form.register('code')}
                />
                <TextField
                  label="Name"
                  inputProps={NO_AUTOFILL}
                  error={Boolean(form.formState.errors.name)}
                  helperText={form.formState.errors.name?.message}
                  {...form.register('name')}
                />
                {isCustomer && (
                  <Controller
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <TextField
                        select
                        label="Type"
                        value={field.value}
                        onChange={field.onChange}
                        sx={{ minWidth: 150 }}
                      >
                        {CUSTOMER_TYPES.map((t) => (
                          <MenuItem key={t.value} value={t.value}>
                            {t.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                )}
              </Stack>

              <Divider />
              <Typography variant="subtitle2">Tax</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Controller
                  control={form.control}
                  name="stateCode"
                  render={({ field, fieldState }) => (
                    <TextField
                      select
                      label="State"
                      value={field.value}
                      onChange={field.onChange}
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message ?? 'GST state code'}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {GST_STATES.map((state) => (
                        <MenuItem key={state.code} value={state.code}>
                          {state.name} ({state.code})
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
                <TextField
                  label="GSTIN"
                  error={Boolean(form.formState.errors.gstin)}
                  helperText={form.formState.errors.gstin?.message}
                  {...form.register('gstin')}
                />
                <TextField
                  label="PAN"
                  error={Boolean(form.formState.errors.panNumber)}
                  helperText={form.formState.errors.panNumber?.message}
                  {...form.register('panNumber')}
                />
              </Stack>

              <Divider />
              <Typography variant="subtitle2">Contact</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Contact person" inputProps={NO_AUTOFILL} {...form.register('contactPerson')} />
                <TextField
                  label={config.requiresPhone ? 'Phone *' : 'Phone'}
                  inputProps={NO_AUTOFILL}
                  required={config.requiresPhone}
                  error={Boolean(form.formState.errors.phone)}
                  helperText={form.formState.errors.phone?.message}
                  {...form.register('phone')}
                />
                <TextField label="Alt phone" inputProps={NO_AUTOFILL} {...form.register('altPhone')} />
                <TextField
                  label="Email"
                  inputProps={NO_AUTOFILL}
                  error={Boolean(form.formState.errors.email)}
                  helperText={form.formState.errors.email?.message}
                  {...form.register('email')}
                />
              </Stack>
              <TextField label="Address line 1" inputProps={NO_AUTOFILL} {...form.register('addressLine1')} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Address line 2" inputProps={NO_AUTOFILL} {...form.register('addressLine2')} />
                <TextField label="City" inputProps={NO_AUTOFILL} {...form.register('city')} />
                <TextField
                  label="PIN code"
                  error={Boolean(form.formState.errors.pincode)}
                  helperText={form.formState.errors.pincode?.message}
                  {...form.register('pincode')}
                />
              </Stack>

              <Divider />
              <Typography variant="subtitle2">
                {isCustomer ? 'Credit terms' : 'Payment terms'}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                {isCustomer ? (
                  <>
                    <TextField label="Credit days" type="number" {...form.register('creditDays')} />
                    <TextField label="Credit limit ₹" type="number" {...form.register('creditLimit')} />
                  </>
                ) : (
                  <TextField
                    label="Payment term days"
                    type="number"
                    {...form.register('paymentTermDays')}
                  />
                )}
                <TextField
                  label="Opening balance ₹"
                  type="number"
                  {...form.register('openingBalance')}
                />
              </Stack>

              <TextField label="Notes" multiline minRows={2} {...form.register('notes')} />
              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={field.value} onChange={field.onChange} />}
                    label="Active"
                  />
                )}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${config.singular}`}
        message={`Delete "${deleting?.name}"? The record is soft-deleted and can be restored.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            if (deleting) await deleteParty.mutateAsync(deleting.id);
          } finally {
            setDeleting(null);
          }
        }}
      />
    </PageContainer>
  );
}
