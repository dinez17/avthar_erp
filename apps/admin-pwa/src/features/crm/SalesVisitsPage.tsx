import { Chip, FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import type { SalesVisitItem, VisitOutcome, VisitPurpose, VisitStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { useSalesmen } from '../sales/api';
import { useVisits, type VisitFilters } from './visits-api';
import {
  VISIT_OUTCOME_LABELS,
  VISIT_PURPOSE_LABELS,
  VISIT_STATUS_COLORS,
  VISIT_STATUS_LABELS,
  VISIT_STATUSES,
} from './config';

/** Field visits across leads — a queue of what's planned, and what's overdue. */
export function SalesVisitsPage(): JSX.Element {
  const pagination = usePagination();
  const salesmen = useSalesmen();

  const [status, setStatus] = useState<VisitStatus | ''>('PLANNED');
  const [salespersonUserId, setSalespersonUserId] = useState('');
  const [overdue, setOverdue] = useState(false);

  const filters: VisitFilters = {
    status: status || undefined,
    salespersonUserId: salespersonUserId || undefined,
    overdue: overdue || undefined,
  };
  const { data, isFetching } = useVisits(pagination.query, filters);

  const columns = useMemo<ColDef<SalesVisitItem>[]>(
    () => [
      {
        field: 'scheduledAt',
        headerName: 'When',
        minWidth: 160,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleString() : ''),
      },
      { field: 'leadName', headerName: 'Lead', minWidth: 180, valueFormatter: (p) => p.value ?? '—' },
      {
        field: 'purpose',
        headerName: 'Purpose',
        minWidth: 160,
        valueFormatter: (p) => VISIT_PURPOSE_LABELS[p.value as VisitPurpose],
      },
      {
        field: 'status',
        headerName: 'Status',
        minWidth: 120,
        cellRenderer: (p: ICellRendererParams<SalesVisitItem>) =>
          p.data?.overdue ? (
            <Chip label="Overdue" size="small" color="error" variant="outlined" />
          ) : (
            <Chip
              label={VISIT_STATUS_LABELS[p.value as VisitStatus]}
              size="small"
              color={VISIT_STATUS_COLORS[p.value as VisitStatus]}
            />
          ),
      },
      {
        field: 'outcome',
        headerName: 'Outcome',
        minWidth: 150,
        valueFormatter: (p) =>
          p.value ? VISIT_OUTCOME_LABELS[p.value as VisitOutcome] : '—',
      },
      {
        field: 'salespersonName',
        headerName: 'Salesperson',
        minWidth: 140,
        valueFormatter: (p) => p.value ?? '—',
      },
      { field: 'location', headerName: 'Location', minWidth: 150, valueFormatter: (p) => p.value ?? '—' },
    ],
    [],
  );

  return (
    <PageContainer
      title="Sales visits"
      subtitle="What's planned in the field, and what has slipped past its date."
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as VisitStatus | '');
              pagination.setPage(1);
            }}
            sx={{ width: 160 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {VISIT_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {VISIT_STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Salesperson"
            size="small"
            value={salespersonUserId}
            onChange={(e) => {
              setSalespersonUserId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All salespeople</MenuItem>
            {(salesmen.data ?? []).map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={overdue}
                onChange={(e) => {
                  setOverdue(e.target.checked);
                  pagination.setPage(1);
                }}
              />
            }
            label="Overdue only"
          />
        </Stack>

        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search visits…"
          height={560}
        />
      </Stack>
    </PageContainer>
  );
}
