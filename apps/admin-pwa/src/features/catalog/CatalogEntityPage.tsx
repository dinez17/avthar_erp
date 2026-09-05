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
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { CatalogItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import {
  useCatalogItems,
  useCatalogOptions,
  useCreateCatalogItem,
  useDeleteCatalogItem,
  useSupplierOptions,
  useUpdateCatalogItem,
} from './api';
import type { CatalogEntityConfig } from './config';

interface CatalogFormValues {
  name: string;
  code: string;
  description: string;
  parentId: string;
  supplierId: string;
  isActive: boolean;
}

const emptyValues: CatalogFormValues = {
  name: '',
  code: '',
  description: '',
  parentId: '',
  supplierId: '',
  isActive: true,
};

function buildSchema(config: CatalogEntityConfig): z.ZodType<CatalogFormValues> {
  return z
    .object({
      name: z.string().trim().min(2, 'At least 2 characters').max(120),
      code: z.string().trim().max(32),
      description: z.string().trim().max(500),
      parentId: z.string(),
      supplierId: z.string(),
      isActive: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (config.parent && values.parentId === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['parentId'],
          message: `${config.parent.label} is required`,
        });
      }
    });
}

/** Generic management page shared by the four catalog masters. */
export function CatalogEntityPage({ config }: { config: CatalogEntityConfig }): JSX.Element {
  const pagination = usePagination();
  const { data, isFetching } = useCatalogItems(config.endpoint, pagination.query);
  const parentOptions = useCatalogOptions(config.parent?.endpoint ?? null);
  const supplierOptions = useSupplierOptions(Boolean(config.supplierField));
  const createItem = useCreateCatalogItem(config.endpoint);
  const updateItem = useUpdateCatalogItem(config.endpoint);
  const deleteItem = useDeleteCatalogItem(config.endpoint);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [deleting, setDeleting] = useState<CatalogItem | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = useMemo(() => buildSchema(config), [config]);
  const form = useForm<CatalogFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  const openCreate = (): void => {
    setEditing(null);
    setServerError(null);
    form.reset(emptyValues);
    setDialogOpen(true);
  };

  const openEdit = (item: CatalogItem): void => {
    setEditing(item);
    setServerError(null);
    form.reset({
      name: item.name,
      code: item.code ?? '',
      description: item.description ?? '',
      parentId: item.parentId ?? '',
      supplierId: item.supplierId ?? '',
      isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (editing) {
        await updateItem.mutateAsync({
          id: editing.id,
          name: values.name,
          code: values.code || null,
          description: values.description || null,
          isActive: values.isActive,
          ...(config.supplierField ? { supplierId: values.supplierId || null } : {}),
          version: editing.version,
        });
      } else {
        await createItem.mutateAsync({
          name: values.name,
          ...(values.code ? { code: values.code } : {}),
          ...(values.description ? { description: values.description } : {}),
          ...(config.parent ? { parentId: values.parentId } : {}),
          ...(config.supplierField ? { supplierId: values.supplierId || null } : {}),
          isActive: values.isActive,
        });
      }
      setDialogOpen(false);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  const columns = useMemo<ColDef<CatalogItem>[]>(() => {
    const cols: ColDef<CatalogItem>[] = [
      { field: 'name', headerName: 'Name', minWidth: 180 },
      { field: 'code', headerName: 'Code', maxWidth: 130 },
    ];
    if (config.parent) {
      cols.push({ field: 'parentName', headerName: config.parent.label, minWidth: 160 });
    }
    if (config.supplierField) {
      cols.push({
        field: 'supplierName',
        headerName: 'Supplier',
        minWidth: 160,
        valueFormatter: (p) => (p.value as string | null) ?? '—',
      });
    }
    cols.push({ field: 'description', headerName: 'Description', minWidth: 220 });
    if (config.childLabel) {
      cols.push({ field: 'childCount', headerName: config.childLabel, maxWidth: 180 });
    }
    cols.push(
      {
        field: 'isActive',
        headerName: 'Status',
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<CatalogItem>) => (
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
        cellRenderer: (p: ICellRendererParams<CatalogItem>) => (
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
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New {config.singular}
        </Button>
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.name}` : `Create ${config.singular}`}</DialogTitle>
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
                        editing ? 'Moving between brands is not supported' : fieldState.error?.message
                      }
                    >
                      {(parentOptions.data ?? []).map((option) => (
                        <MenuItem key={option.id} value={option.id}>
                          {option.name}
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
              <TextField
                label="Code (optional)"
                error={Boolean(form.formState.errors.code)}
                helperText={form.formState.errors.code?.message}
                {...form.register('code')}
              />
              {config.supplierField && (
                <Controller
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <TextField
                      select
                      label="Supplier"
                      value={field.value}
                      onChange={field.onChange}
                      helperText="Every product under this brand is supplied by this supplier"
                    >
                      <MenuItem value="">No supplier</MenuItem>
                      {(supplierOptions.data ?? []).map((supplier) => (
                        <MenuItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              )}
              <TextField
                label="Description"
                multiline
                minRows={2}
                {...form.register('description')}
              />
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
        message={`Delete "${deleting?.name}"? Masters referenced elsewhere cannot be deleted.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            if (deleting) await deleteItem.mutateAsync(deleting.id);
          } finally {
            setDeleting(null);
          }
        }}
      />
    </PageContainer>
  );
}
