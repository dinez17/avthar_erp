import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import type { AuditLogItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { useAuditEntities, useAuditLogs } from './api';

const ACTION_COLORS: Record<string, 'success' | 'info' | 'error'> = {
  created: 'success',
  updated: 'info',
  deleted: 'error',
};

export function AuditLogPage(): JSX.Element {
  const pagination = usePagination();
  const [entity, setEntity] = useState('');
  const { data, isFetching } = useAuditLogs(pagination.query, entity || undefined);
  const entities = useAuditEntities();
  const [viewing, setViewing] = useState<AuditLogItem | null>(null);

  const columns = useMemo<ColDef<AuditLogItem>[]>(
    () => [
      {
        field: 'createdAt',
        headerName: 'When',
        minWidth: 180,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleString() : ''),
      },
      { field: 'userEmail', headerName: 'User', minWidth: 200 },
      { field: 'entity', headerName: 'Entity', maxWidth: 150 },
      {
        field: 'action',
        headerName: 'Action',
        maxWidth: 130,
        cellRenderer: (p: ICellRendererParams<AuditLogItem>) => (
          <Chip
            label={p.data?.action}
            size="small"
            color={ACTION_COLORS[p.data?.action ?? ''] ?? 'default'}
          />
        ),
      },
      { field: 'entityId', headerName: 'Record', minWidth: 200 },
      {
        headerName: '',
        maxWidth: 70,
        cellRenderer: (p: ICellRendererParams<AuditLogItem>) => (
          <IconButton
            size="small"
            aria-label="View details"
            onClick={() => p.data && setViewing(p.data)}
          >
            <VisibilityIcon fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [],
  );

  return (
    <PageContainer title="Audit log" subtitle="Every change made through the system, newest first.">
      <Stack spacing={1.5}>
        <TextField
          select
          label="Entity"
          size="small"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            pagination.setPage(1);
          }}
          sx={{ maxWidth: 240 }}
        >
          <MenuItem value="">All entities</MenuItem>
          {(entities.data ?? []).map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by record id…"
        />
      </Stack>

      <Dialog open={viewing !== null} onClose={() => setViewing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {viewing?.action} {viewing?.entity} — {viewing?.userEmail ?? 'system'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary">
            {viewing && new Date(viewing.createdAt).toLocaleString()} · record {viewing?.entityId}
          </Typography>
          <Box
            component="pre"
            sx={{
              mt: 1.5,
              p: 1.5,
              bgcolor: 'action.hover',
              borderRadius: 1,
              overflow: 'auto',
              fontSize: 13,
              maxHeight: 400,
            }}
          >
            {JSON.stringify(viewing?.changes ?? {}, null, 2)}
          </Box>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
