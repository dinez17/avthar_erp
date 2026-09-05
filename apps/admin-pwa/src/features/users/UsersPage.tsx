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
import type { UserListItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useRoles } from '../roles/api';
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from './api';

const userFormSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Needs an uppercase letter')
    .regex(/[a-z]/, 'Needs a lowercase letter')
    .regex(/\d/, 'Needs a digit')
    .or(z.literal('')),
  firstName: z.string().trim().min(1, 'Required'),
  lastName: z.string().trim().min(1, 'Required'),
  isActive: z.boolean(),
  roleIds: z.array(z.string().uuid()).min(1, 'Assign at least one role'),
});

type UserFormValues = z.infer<typeof userFormSchema>;

const emptyValues: UserFormValues = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  isActive: true,
  roleIds: [],
};

export function UsersPage(): JSX.Element {
  const pagination = usePagination();
  const { data, isFetching } = useUsers(pagination.query);
  const rolesQuery = useRoles({ page: 1, pageSize: 100, sortOrder: 'asc' });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [deleting, setDeleting] = useState<UserListItem | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: emptyValues,
  });

  const openCreate = (): void => {
    setEditing(null);
    setServerError(null);
    form.reset(emptyValues);
    setDialogOpen(true);
  };

  const openEdit = (user: UserListItem): void => {
    setEditing(user);
    setServerError(null);
    form.reset({
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      roleIds: user.roles.map((r) => r.id),
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (editing) {
        await updateUser.mutateAsync({
          id: editing.id,
          firstName: values.firstName,
          lastName: values.lastName,
          isActive: values.isActive,
          roleIds: values.roleIds,
          ...(values.password ? { password: values.password } : {}),
          version: editing.version,
        });
      } else {
        if (!values.password) {
          form.setError('password', { message: 'Password is required for new users' });
          return;
        }
        await createUser.mutateAsync({
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          isActive: values.isActive,
          roleIds: values.roleIds,
          branchIds: [],
          departmentIds: [],
        });
      }
      setDialogOpen(false);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  const columns = useMemo<ColDef<UserListItem>[]>(
    () => [
      { field: 'email', headerName: 'Email', minWidth: 220 },
      {
        headerName: 'Name',
        valueGetter: (p) => (p.data ? `${p.data.firstName} ${p.data.lastName}` : ''),
      },
      {
        field: 'roles',
        headerName: 'Roles',
        cellRenderer: (p: ICellRendererParams<UserListItem>) => (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', height: '100%' }}>
            {p.data?.roles.map((r) => <Chip key={r.id} label={r.name} size="small" />)}
          </Stack>
        ),
      },
      {
        field: 'isActive',
        headerName: 'Status',
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<UserListItem>) => (
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
        sortable: false,
        cellRenderer: (p: ICellRendererParams<UserListItem>) => (
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
    ],
    [],
  );

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void onSubmit(), dialogOpen);

  return (
    <PageContainer
      title="Users"
      subtitle="Manage user accounts, status and role assignment."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New user
        </Button>
      }
    >
      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        meta={data?.meta}
        pagination={pagination}
        loading={isFetching}
        searchPlaceholder="Search by name or email…"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.email}` : 'Create user'}</DialogTitle>
        <form onSubmit={onSubmit} noValidate autoComplete="off">
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {serverError && <Alert severity="error">{serverError}</Alert>}
              <TextField
                label="Email"
                type="email"
                disabled={Boolean(editing)}
                error={Boolean(form.formState.errors.email)}
                helperText={form.formState.errors.email?.message}
                {...form.register('email')}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="First name"
                  error={Boolean(form.formState.errors.firstName)}
                  helperText={form.formState.errors.firstName?.message}
                  {...form.register('firstName')}
                />
                <TextField
                  label="Last name"
                  error={Boolean(form.formState.errors.lastName)}
                  helperText={form.formState.errors.lastName?.message}
                  {...form.register('lastName')}
                />
              </Stack>
              <TextField
                label={editing ? 'New password (leave blank to keep)' : 'Password'}
                type="password"
                autoComplete="new-password"
                error={Boolean(form.formState.errors.password)}
                helperText={form.formState.errors.password?.message}
                {...form.register('password')}
              />
              <Controller
                control={form.control}
                name="roleIds"
                render={({ field, fieldState }) => (
                  <TextField
                    select
                    label="Roles"
                    slotProps={{ select: { multiple: true } }}
                    value={field.value}
                    onChange={field.onChange}
                    error={Boolean(fieldState.error)}
                    helperText={fieldState.error?.message}
                  >
                    {(rolesQuery.data?.items ?? []).map((role) => (
                      <MenuItem key={role.id} value={role.id}>
                        {role.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
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
              {editing ? 'Save changes' : 'Create user'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete user"
        message={`Delete ${deleting?.email}? The account is soft-deleted and can be restored by an engineer.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteUser.mutateAsync(deleting.id);
          setDeleting(null);
        }}
      />
    </PageContainer>
  );
}
