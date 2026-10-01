import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
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
import { ListExportButtons, type ExportColumn } from '../../components/ListExportButtons';
import { useAuditEntities, useAuditLogs } from './api';

const ACTION_COLORS: Record<string, 'success' | 'info' | 'error'> = {
  created: 'success',
  updated: 'info',
  deleted: 'error',
};

const changesText = (changes: AuditLogItem['changes']): string =>
  changes ? JSON.stringify(changes) : '';

const auditExportColumns: ExportColumn<AuditLogItem>[] = [
  { header: 'Audit ID', value: (row) => row.id, width: 190 },
  { header: 'Date and time', value: (row) => new Date(row.createdAt).toLocaleString('en-IN'), width: 130 },
  { header: 'User', value: (row) => row.userEmail ?? 'System', width: 180 },
  { header: 'User ID', value: (row) => row.userId ?? '', width: 190 },
  { header: 'Entity', value: (row) => row.entity, width: 120 },
  { header: 'Action', value: (row) => row.action, width: 120 },
  { header: 'Record ID', value: (row) => row.entityId, width: 190 },
  { header: 'Complete data', value: (row) => changesText(row.changes), width: 320 },
];

export function AuditLogPage(): JSX.Element {
  const pagination = usePagination();
  const [entity, setEntity] = useState('');
  const { data, isFetching } = useAuditLogs(pagination.query, entity || undefined);
  const entities = useAuditEntities();
  const [viewing, setViewing] = useState<AuditLogItem | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const columns = useMemo<ColDef<AuditLogItem>[]>(
    () => [
      {
        field: 'createdAt',
        headerName: 'When',
        minWidth: 180,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleString() : ''),
      },
      { field: 'userEmail', headerName: 'User', minWidth: 200 },
      { field: 'userId', headerName: 'User ID', minWidth: 210 },
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
        field: 'changes',
        headerName: 'Data',
        minWidth: 320,
        flex: 1,
        valueFormatter: (p) => changesText(p.value as AuditLogItem['changes']) || '—',
        tooltipValueGetter: (p) => changesText(p.value as AuditLogItem['changes']) || 'No request data',
      },
      { field: 'id', headerName: 'Audit ID', minWidth: 210 },
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
        {exportError && (
          <Alert severity="error" onClose={() => setExportError(null)}>
            {exportError}
          </Alert>
        )}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            select
            label="Entity"
            size="small"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: { xs: '100%', sm: 240 } }}
          >
            <MenuItem value="">All entities</MenuItem>
            {(entities.data ?? []).map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          <ListExportButtons<AuditLogItem>
            path="/audit"
            params={{ entity: entity || undefined, search: pagination.query.search }}
            columns={auditExportColumns}
            title="Audit Log"
            filename="audit-log"
            onError={setExportError}
          />
        </Stack>
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search audit ID, record, entity, action or user…"
          gridOptions={{ enableCellTextSelection: true, ensureDomOrder: true }}
        />
      </Stack>

      <Dialog open={viewing !== null} onClose={() => setViewing(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {viewing?.action} {viewing?.entity} — {viewing?.userEmail ?? 'system'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={0.75}>
            <Typography><strong>Date and time:</strong> {viewing && new Date(viewing.createdAt).toLocaleString()}</Typography>
            <Typography><strong>Audit ID:</strong> {viewing?.id}</Typography>
            <Typography><strong>User:</strong> {viewing?.userEmail ?? 'System'}</Typography>
            <Typography><strong>User ID:</strong> {viewing?.userId ?? '—'}</Typography>
            <Typography><strong>Entity:</strong> {viewing?.entity}</Typography>
            <Typography><strong>Action:</strong> {viewing?.action}</Typography>
            <Typography><strong>Record ID:</strong> {viewing?.entityId}</Typography>
          </Stack>
          <Typography variant="subtitle2" sx={{ mt: 2 }}>Complete recorded data</Typography>
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
        <DialogActions>
          <Button onClick={() => setViewing(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
