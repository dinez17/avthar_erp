import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { Button, Chip, IconButton } from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { RoleListItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { useDeleteRole, useRoles } from './api';

export function RolesPage(): JSX.Element {
  const pagination = usePagination();
  const navigate = useNavigate();
  const { data, isFetching } = useRoles(pagination.query);
  const deleteRole = useDeleteRole();
  const [deleting, setDeleting] = useState<RoleListItem | null>(null);

  const columns = useMemo<ColDef<RoleListItem>[]>(() => [
    { field: 'name', headerName: 'Role', minWidth: 180 },
    { field: 'description', headerName: 'Description', minWidth: 220 },
    { field: 'permissions', headerName: 'Permissions', valueGetter: (p) => p.data?.permissions.length ?? 0, maxWidth: 140 },
    { field: 'userCount', headerName: 'Users', maxWidth: 110 },
    { field: 'isSystem', headerName: 'Type', maxWidth: 120,
      cellRenderer: (p: ICellRendererParams<RoleListItem>) => <Chip label={p.data?.isSystem ? 'System' : 'Custom'}
        size="small" color={p.data?.isSystem ? 'info' : 'default'} /> },
    { headerName: '', maxWidth: 110, sortable: false,
      cellRenderer: (p: ICellRendererParams<RoleListItem>) => <>
        <IconButton size="small" aria-label="Edit" onClick={() => p.data && navigate(`/roles/${p.data.id}/edit`)}>
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Delete" disabled={p.data?.isSystem}
          onClick={() => p.data && setDeleting(p.data)}><DeleteIcon fontSize="small" /></IconButton>
      </> },
  ], [navigate]);

  return <PageContainer title="Roles" subtitle="Define roles and the permissions they grant."
    actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/roles/new')}>New role</Button>}>
    <DataTable rows={data?.items ?? []} columns={columns} meta={data?.meta} pagination={pagination}
      loading={isFetching} searchPlaceholder="Search roles…" />
    <ConfirmDialog open={deleting !== null} title="Delete role"
      message={`Delete role "${deleting?.name}"? Roles in use cannot be deleted.`} destructive
      confirmLabel="Delete" onCancel={() => setDeleting(null)}
      onConfirm={async () => { try { if (deleting) await deleteRole.mutateAsync(deleting.id); } finally { setDeleting(null); } }} />
  </PageContainer>;
}
