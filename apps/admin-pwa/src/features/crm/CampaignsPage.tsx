import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { Alert, Button, Chip, IconButton, Stack, Tooltip } from '@mui/material';
import type { CellStyle, ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { CampaignChannel, CampaignPerformanceRow, CampaignStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { CampaignFormDialog } from './CampaignFormDialog';
import { useCampaignPerformance, useDeleteCampaign } from './campaigns-api';
import {
  CAMPAIGN_STATUS_COLORS,
  CAMPAIGN_STATUS_LABELS,
  CHANNEL_LABELS,
  money,
  percent,
  roiLabel,
} from './config';

/** Marketing campaigns with a spend-to-return report: leads, conversions, cost and ROI. */
export function CampaignsPage(): JSX.Element {
  const { data, isFetching } = useCampaignPerformance();
  const deleteCampaign = useDeleteCampaign();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CampaignPerformanceRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo<ColDef<CampaignPerformanceRow>[]>(
    () => [
      { field: 'code', headerName: 'Code', minWidth: 130 },
      { field: 'name', headerName: 'Campaign', minWidth: 190 },
      {
        field: 'channel',
        headerName: 'Channel',
        minWidth: 130,
        valueFormatter: (p) => CHANNEL_LABELS[p.value as CampaignChannel],
      },
      {
        field: 'status',
        headerName: 'Status',
        minWidth: 120,
        cellRenderer: (p: ICellRendererParams<CampaignPerformanceRow>) => (
          <Chip
            label={CAMPAIGN_STATUS_LABELS[p.value as CampaignStatus]}
            size="small"
            color={CAMPAIGN_STATUS_COLORS[p.value as CampaignStatus]}
          />
        ),
      },
      {
        field: 'budget',
        headerName: 'Budget',
        minWidth: 110,
        valueFormatter: (p) => money(p.value as number),
      },
      { field: 'leadsCount', headerName: 'Leads', maxWidth: 90 },
      { field: 'convertedCount', headerName: 'Converted', maxWidth: 110 },
      {
        field: 'conversionRate',
        headerName: 'Conv %',
        maxWidth: 100,
        valueFormatter: (p) => percent(p.value as number),
      },
      {
        field: 'costPerLead',
        headerName: 'Cost/lead',
        minWidth: 110,
        valueFormatter: (p) => (p.value === null ? '—' : money(p.value as number)),
      },
      {
        field: 'convertedValue',
        headerName: 'Won value',
        minWidth: 120,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'roiPct',
        headerName: 'ROI',
        minWidth: 100,
        cellStyle: (p): CellStyle => {
          const value = p.value as number | null;
          const style: CellStyle = { fontWeight: 600 };
          if (value !== null) style.color = value >= 0 ? '#2e7d32' : '#d32f2f';
          return style;
        },
        valueFormatter: (p) => roiLabel(p.value as number | null),
      },
      {
        headerName: '',
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<CampaignPerformanceRow>) => {
          const row = p.data;
          if (!row) return null;
          return (
            <>
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={() => {
                    setEditingId(row.campaignId);
                    setFormOpen(true);
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          );
        },
      },
    ],
    [],
  );

  return (
    <PageContainer
      title="Marketing campaigns"
      subtitle="Spend against the leads it drew and how many converted — cost per lead and ROI."
      actions={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingId(null);
            setFormOpen(true);
          }}
        >
          New campaign
        </Button>
      }
    >
      <Stack spacing={1.5}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <DataTable
          rows={data ?? []}
          columns={columns}
          loading={isFetching}
          height={560}
        />
      </Stack>

      <CampaignFormDialog
        open={formOpen}
        campaignId={editingId}
        onClose={() => setFormOpen(false)}
        onSaved={(message) => setNotice(message)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete campaign"
        message={`Delete ${deleting?.name}? Its leads keep their history but lose the attribution.`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const row = deleting;
          setDeleting(null);
          if (!row) return;
          setError(null);
          deleteCampaign
            .mutateAsync(row.campaignId)
            .then(() => setNotice(`${row.code} deleted.`))
            .catch((err) =>
              setError(err instanceof ApiError ? err.message : 'Something went wrong'),
            );
        }}
      />
    </PageContainer>
  );
}
