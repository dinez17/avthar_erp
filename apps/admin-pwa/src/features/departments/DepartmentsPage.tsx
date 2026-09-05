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
import type { DepartmentListItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import {
  useCreateDepartment,
  useDeleteDepartment,
  useDepartments,
  useUpdateDepartment,
} from './api';

const departmentFormSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(64),
  description: z.string().trim().max(255).optional(),
  isActive: z.boolean(),
});

type DepartmentFormValues = z.infer<typeof departmentFormSchema>;

export function DepartmentsPage(): JSX.Element {
  const pagination = usePagination();
  const { data, isFetching } = useDepartments(pagination.query);
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentListItem | null>(null);
  const [deleting, setDeleting] = useState<DepartmentListItem | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: { name: '', description: '', isActive: true },
  });

  const openCreate = (): void => {
    setEditing(null);
    setServerError(null);
    form.reset({ name: '', description: '', isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (department: DepartmentListItem): void => {
    setEditing(department);
    setServerError(null);
    form.reset({
      name: department.name,
      description: department.description ?? '',
      isActive: department.isActive,
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (editing) {
        await updateDepartment.mutateAsync({ id: editing.id, ...values, version: editing.version });
      } else {
        await createDepartment.mutateAsync(values);
      }
      setDialogOpen(false);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  const columns = useMemo<ColDef<DepartmentListItem>[]>(
    () => [
      { field: 'name', headerName: 'Department', minWidth: 180 },
      { field: 'description', headerName: 'Description', minWidth: 240 },
      { field: 'userCount', headerName: 'Users', maxWidth: 110 },
      {
        field: 'isActive',
        headerName: 'Status',
        maxWidth: 120,
        cellRenderer: (p: ICellRendererParams<DepartmentListItem>) => (
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
        cellRenderer: (p: ICellRendererParams<DepartmentListItem>) => (
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
      title="Departments"
      subtitle="Organise users into departments for scoped access."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New department
        </Button>
      }
    >
      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        meta={data?.meta}
        pagination={pagination}
        loading={isFetching}
        searchPlaceholder="Search departments…"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Create department'}</DialogTitle>
        <form onSubmit={onSubmit} noValidate autoComplete="off">
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {serverError && <Alert severity="error">{serverError}</Alert>}
              <TextField
                label="Name"
                error={Boolean(form.formState.errors.name)}
                helperText={form.formState.errors.name?.message}
                {...form.register('name')}
              />
              <TextField label="Description" multiline minRows={2} {...form.register('description')} />
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
              {editing ? 'Save changes' : 'Create department'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete department"
        message={`Delete department "${deleting?.name}"? Departments with assigned users cannot be deleted.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            if (deleting) await deleteDepartment.mutateAsync(deleting.id);
          } finally {
            setDeleting(null);
          }
        }}
      />
    </PageContainer>
  );
}
