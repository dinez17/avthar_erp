import { zodResolver } from '@hookform/resolvers/zod';
import AddIcon from '@mui/icons-material/Add';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
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
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { GST_STATES } from '@tiles-erp/config';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { OrgNodeItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import {
  useCreateOrgNode,
  useDeleteOrgNode,
  useOrgNodes,
  useOrgOptions,
  useUpdateOrgNode,
} from './api';
import { BulkCreateDialog } from './BulkCreateDialog';
import type { OrgEntityConfig } from './config';

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;

interface OrgFormValues {
  name: string;
  code: string;
  legalName: string;
  gstin: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateCode: string;
  pincode: string;
  phone: string;
  email: string;
  parentId: string;
  isActive: boolean;
}

const emptyValues: OrgFormValues = {
  name: '',
  code: '',
  legalName: '',
  gstin: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  stateCode: '',
  pincode: '',
  phone: '',
  email: '',
  parentId: '',
  isActive: true,
};

function buildSchema(config: OrgEntityConfig): z.ZodType<OrgFormValues> {
  return z
    .object({
      name: z.string().trim().min(2, 'At least 2 characters').max(120),
      code: z.string().trim().max(32),
      legalName: z.string().trim().max(200),
      gstin: z
        .string()
        .trim()
        .toUpperCase()
        .refine((v) => v === '' || GSTIN_REGEX.test(v), 'Invalid GSTIN'),
      addressLine1: z.string().trim().max(200),
      addressLine2: z.string().trim().max(200),
      city: z.string().trim().max(100),
      stateCode: z
        .string()
        .refine(
          (v) => v === '' || GST_STATES.some((s) => s.code === v),
          'Select a valid state',
        ),
      pincode: z
        .string()
        .trim()
        .refine((v) => v === '' || /^\d{6}$/.test(v), 'Must be a 6-digit PIN code'),
      phone: z
        .string()
        .trim()
        .refine((v) => v === '' || /^[+]?\d{7,15}$/.test(v), 'Must be 7-15 digits (optional +)'),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Invalid email'),
      parentId: z.string(),
      isActive: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (config.hasCode && values.code === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['code'], message: 'Code is required' });
      }
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
      if (config.parent && values.parentId === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parentId'],
          message: `${config.parent.label} is required`,
        });
      }
    });
}

/** Generic management page used by every level of the company hierarchy. */
export function OrgEntityPage({ config }: { config: OrgEntityConfig }): JSX.Element {
  const pagination = usePagination();
  const { data, isFetching } = useOrgNodes(config.endpoint, pagination.query);
  const parentOptions = useOrgOptions(config.parent?.endpoint ?? null);
  const createNode = useCreateOrgNode(config.endpoint);
  const updateNode = useUpdateOrgNode(config.endpoint);
  const deleteNode = useDeleteOrgNode(config.endpoint);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<OrgNodeItem | null>(null);
  const [deleting, setDeleting] = useState<OrgNodeItem | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = useMemo(() => buildSchema(config), [config]);
  const form = useForm<OrgFormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues });

  const openCreate = (): void => {
    setEditing(null);
    setServerError(null);
    form.reset(emptyValues);
    setDialogOpen(true);
  };

  const openEdit = (node: OrgNodeItem): void => {
    setEditing(node);
    setServerError(null);
    form.reset({
      name: node.name,
      code: node.code ?? '',
      legalName: node.legalName ?? '',
      gstin: node.gstin ?? '',
      addressLine1: node.addressLine1 ?? '',
      addressLine2: node.addressLine2 ?? '',
      city: node.city ?? '',
      stateCode: node.stateCode ?? '',
      pincode: node.pincode ?? '',
      phone: node.phone ?? '',
      email: node.email ?? '',
      parentId: node.parentId ?? '',
      isActive: node.isActive,
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (editing) {
        await updateNode.mutateAsync({
          id: editing.id,
          name: values.name,
          ...(config.hasCode ? { code: values.code } : {}),
          ...(config.hasLegalName ? { legalName: values.legalName || null } : {}),
          ...(config.hasGstin ? { gstin: values.gstin || null } : {}),
          ...(config.hasContact
            ? {
                addressLine1: values.addressLine1 || null,
                addressLine2: values.addressLine2 || null,
                city: values.city || null,
                stateCode: values.stateCode || null,
                pincode: values.pincode || null,
                phone: values.phone || null,
                email: values.email || null,
              }
            : {}),
          isActive: values.isActive,
          version: editing.version,
        });
      } else {
        await createNode.mutateAsync({
          name: values.name,
          ...(config.hasCode ? { code: values.code } : {}),
          ...(config.hasLegalName && values.legalName ? { legalName: values.legalName } : {}),
          ...(config.hasGstin && values.gstin ? { gstin: values.gstin } : {}),
          ...(config.hasContact
            ? {
                ...(values.addressLine1 ? { addressLine1: values.addressLine1 } : {}),
                ...(values.addressLine2 ? { addressLine2: values.addressLine2 } : {}),
                ...(values.city ? { city: values.city } : {}),
                ...(values.stateCode ? { stateCode: values.stateCode } : {}),
                ...(values.pincode ? { pincode: values.pincode } : {}),
                ...(values.phone ? { phone: values.phone } : {}),
                ...(values.email ? { email: values.email } : {}),
              }
            : {}),
          ...(config.parent ? { parentId: values.parentId } : {}),
          isActive: values.isActive,
        });
      }
      setDialogOpen(false);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  const columns = useMemo<ColDef<OrgNodeItem>[]>(() => {
    const cols: ColDef<OrgNodeItem>[] = [{ field: 'name', headerName: 'Name', minWidth: 180 }];
    if (config.hasCode) cols.push({ field: 'code', headerName: 'Code', maxWidth: 140 });
    if (config.parent) {
      cols.push({ field: 'parentName', headerName: config.parent.label, minWidth: 160 });
    }
    if (config.hasGstin) cols.push({ field: 'gstin', headerName: 'GSTIN', minWidth: 180 });
    if (config.hasContact) {
      cols.push(
        { field: 'city', headerName: 'City', minWidth: 130 },
        {
          field: 'state',
          headerName: 'State',
          minWidth: 160,
          valueGetter: (p) =>
            p.data?.state ? `${p.data.state}${p.data.stateCode ? ` (${p.data.stateCode})` : ''}` : '',
        },
        { field: 'phone', headerName: 'Phone', minWidth: 140 },
        { field: 'email', headerName: 'Email', minWidth: 180 },
      );
    }
    if (config.childLabel !== '—') {
      cols.push({ field: 'childCount', headerName: config.childLabel, maxWidth: 130 });
    }
    cols.push(
      {
        field: 'isActive',
        headerName: 'Status',
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<OrgNodeItem>) => (
          <Chip
            label={p.data?.isActive ? 'Active' : 'Inactive'}
            color={p.data?.isActive ? 'success' : 'default'}
            size="small"
          />
        ),
      },
      {
        headerName: '',
        maxWidth: 110,
        cellRenderer: (p: ICellRendererParams<OrgNodeItem>) => (
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
  }, [config]);

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void onSubmit(), dialogOpen);

  return (
    <PageContainer
      title={config.title}
      subtitle={config.subtitle}
      actions={
        <Stack direction="row" spacing={1}>
          {config.bulk && (
            <Button
              variant="outlined"
              startIcon={<PlaylistAddIcon />}
              onClick={() => setBulkOpen(true)}
            >
              Bulk create
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New {config.singular}
          </Button>
        </Stack>
      }
    >
      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        meta={data?.meta}
        pagination={pagination}
        loading={isFetching}
        searchPlaceholder={`Search ${config.title.toLowerCase()}…`}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth={config.hasContact ? 'sm' : 'xs'}
        fullWidth
      >
        <DialogTitle>
          {editing ? `Edit ${editing.name}` : `Create ${config.singular}`}
        </DialogTitle>
        <form onSubmit={onSubmit} noValidate autoComplete="off">
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {serverError && <Alert severity="error">{serverError}</Alert>}
              {config.parent && (
                <Controller
                  control={form.control}
                  name="parentId"
                  render={({ field, fieldState }) => (
                    <TextField
                      select
                      label={config.parent?.label}
                      disabled={Boolean(editing)}
                      value={field.value}
                      onChange={field.onChange}
                      error={Boolean(fieldState.error)}
                      helperText={
                        editing
                          ? 'Moving between parents is not supported yet'
                          : fieldState.error?.message
                      }
                    >
                      {(parentOptions.data ?? []).map((option) => (
                        <MenuItem key={option.id} value={option.id}>
                          {option.name}
                          {option.code ? ` (${option.code})` : ''}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              )}
              <TextField
                label="Name"
                error={Boolean(form.formState.errors.name)}
                helperText={form.formState.errors.name?.message}
                {...form.register('name')}
              />
              {config.hasCode && (
                <TextField
                  label="Code"
                  error={Boolean(form.formState.errors.code)}
                  helperText={form.formState.errors.code?.message ?? 'Unique identifier, e.g. HQ-001'}
                  {...form.register('code')}
                />
              )}
              {config.hasLegalName && (
                <TextField label="Legal name" {...form.register('legalName')} />
              )}
              {config.hasGstin && (
                <TextField
                  label="GSTIN"
                  error={Boolean(form.formState.errors.gstin)}
                  helperText={form.formState.errors.gstin?.message}
                  {...form.register('gstin')}
                />
              )}
              {config.hasContact && (
                <>
                  <TextField label="Address line 1" {...form.register('addressLine1')} />
                  <TextField label="Address line 2" {...form.register('addressLine2')} />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField label="City" {...form.register('city')} />
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
                          helperText={
                            fieldState.error?.message ?? 'GST state code, used for billing'
                          }
                          sx={{ minWidth: 220 }}
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
                      label="PIN code"
                      error={Boolean(form.formState.errors.pincode)}
                      helperText={form.formState.errors.pincode?.message}
                      {...form.register('pincode')}
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Phone"
                      error={Boolean(form.formState.errors.phone)}
                      helperText={form.formState.errors.phone?.message}
                      {...form.register('phone')}
                    />
                    <TextField
                      label="Email"
                      type="email"
                      error={Boolean(form.formState.errors.email)}
                      helperText={form.formState.errors.email?.message}
                      {...form.register('email')}
                    />
                  </Stack>
                </>
              )}
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

      {config.bulk && (
        <BulkCreateDialog open={bulkOpen} onClose={() => setBulkOpen(false)} config={config} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${config.singular}`}
        message={`Delete "${deleting?.name}"? Levels with children cannot be deleted.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            if (deleting) await deleteNode.mutateAsync(deleting.id);
          } finally {
            setDeleting(null);
          }
        }}
      />
    </PageContainer>
  );
}
