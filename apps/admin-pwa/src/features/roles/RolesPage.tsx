import { zodResolver } from '@hookform/resolvers/zod';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { RoleListItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useCreateRole, useDeleteRole, usePermissionCodes, useRoles, useUpdateRole } from './api';

const roleFormSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(64),
  description: z.string().trim().max(255).optional(),
  isSalesRole: z.boolean(),
  permissionCodes: z.array(z.string()),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

export function RolesPage(): JSX.Element {
  const pagination = usePagination();
  const { data, isFetching } = useRoles(pagination.query);
  const permissions = usePermissionCodes();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoleListItem | null>(null);
  const [deleting, setDeleting] = useState<RoleListItem | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { name: '', description: '', isSalesRole: false, permissionCodes: [] },
  });

  const openCreate = (): void => {
    setEditing(null);
    setServerError(null);
    form.reset({ name: '', description: '', isSalesRole: false, permissionCodes: [] });
    setDialogOpen(true);
  };

  const openEdit = (role: RoleListItem): void => {
    setEditing(role);
    setServerError(null);
    form.reset({
      name: role.name,
      description: role.description ?? '',
      isSalesRole: role.isSalesRole,
      permissionCodes: role.permissions,
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (editing) {
        await updateRole.mutateAsync({
          id: editing.id,
          name: editing.isSystem ? undefined : values.name,
          description: values.description,
          isSalesRole: values.isSalesRole,
          permissionCodes: values.permissionCodes,
          version: editing.version,
        });
      } else {
        await createRole.mutateAsync({
          name: values.name,
          description: values.description,
          isSalesRole: values.isSalesRole,
          permissionCodes: values.permissionCodes,
        });
      }
      setDialogOpen(false);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  const columns = useMemo<ColDef<RoleListItem>[]>(
    () => [
      { field: 'name', headerName: 'Role', minWidth: 180 },
      { field: 'description', headerName: 'Description', minWidth: 220 },
      {
        field: 'permissions',
        headerName: 'Permissions',
        valueGetter: (p) => p.data?.permissions.length ?? 0,
        maxWidth: 140,
      },
      { field: 'userCount', headerName: 'Users', maxWidth: 110 },
      {
        field: 'isSystem',
        headerName: 'Type',
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<RoleListItem>) => (
          <Chip
            label={p.data?.isSystem ? 'System' : 'Custom'}
            size="small"
            color={p.data?.isSystem ? 'info' : 'default'}
          />
        ),
      },
      {
        headerName: '',
        maxWidth: 110,
        cellRenderer: (p: ICellRendererParams<RoleListItem>) => (
          <>
            <IconButton size="small" aria-label="Edit" onClick={() => p.data && openEdit(p.data)}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Delete"
              disabled={p.data?.isSystem}
              onClick={() => p.data && setDeleting(p.data)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </>
        ),
      },
    ],
    [],
  );

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void onSubmit(), dialogOpen);

  return (
    <PageContainer
      title="Roles"
      subtitle="Define roles and the permissions they grant."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New role
        </Button>
      }
    >
      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        meta={data?.meta}
        pagination={pagination}
        loading={isFetching}
        searchPlaceholder="Search roles…"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Create role'}</DialogTitle>
        <form onSubmit={onSubmit} noValidate autoComplete="off">
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {serverError && <Alert severity="error">{serverError}</Alert>}
              <TextField
                label="Name"
                disabled={editing?.isSystem ?? false}
                error={Boolean(form.formState.errors.name)}
                helperText={
                  editing?.isSystem
                    ? 'System roles cannot be renamed'
                    : form.formState.errors.name?.message
                }
                {...form.register('name')}
              />
              <TextField label="Description" multiline minRows={2} {...form.register('description')} />
              <Controller
                control={form.control}
                name="isSalesRole"
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    }
                    label="Sales role (users appear in salesman pickers)"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="permissionCodes"
                render={({ field, fieldState }) => (
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2">Permissions</Typography>
                    <FormGroup sx={{ maxHeight: 260, overflowY: 'auto', pl: 0.5 }}>
                      {(permissions.data ?? []).map((code) => (
                        <FormControlLabel
                          key={code}
                          control={
                            <Checkbox
                              size="small"
                              checked={field.value.includes(code)}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.checked
                                    ? [...field.value, code]
                                    : field.value.filter((c) => c !== code),
                                )
                              }
                            />
                          }
                          label={code}
                        />
                      ))}
                    </FormGroup>
                    {fieldState.error && (
                      <FormHelperText error>{fieldState.error.message}</FormHelperText>
                    )}
                  </Stack>
                )}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create role'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete role"
        message={`Delete role "${deleting?.name}"? Roles in use cannot be deleted.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            if (deleting) await deleteRole.mutateAsync(deleting.id);
          } finally {
            setDeleting(null);
          }
        }}
      />
    </PageContainer>
  );
}
