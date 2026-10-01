import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import EventIcon from '@mui/icons-material/Event';
import MoveUpIcon from '@mui/icons-material/MoveUp';
import PhoneIcon from '@mui/icons-material/Phone';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import TimelineIcon from '@mui/icons-material/Timeline';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useEffect, useMemo, useState } from 'react';
import { useDebounce, usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { LeadItem, LeadSource, LeadStage } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { useSalesmen } from '../sales/api';
import { useCampaignOptions } from './campaigns-api';
import {
  useChangeLeadStage,
  useDeleteLead,
  useLeadPipeline,
  useLeads,
  type LeadFilters,
} from './api';
import { CallLogDialog } from './CallLogDialog';
import { ConvertLeadDialog } from './ConvertLeadDialog';
import { LeadFormDialog } from './LeadFormDialog';
import { VisitDialog } from './VisitDialog';
import {
  HAND_STAGES,
  money,
  SOURCE_LABELS,
  SOURCES,
  STAGE_COLORS,
  STAGE_LABELS,
  STAGES,
} from './config';
import { useSessionBranchId } from '../../lib/session-branch';

const isSettled = (stage: LeadStage): boolean =>
  stage === 'CONVERTED' || stage === 'NOT_INTERESTED';

export function LeadsPage(): JSX.Element {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const pagination = usePagination();
  const branches = useBranches();
  const salesmen = useSalesmen();
  const campaigns = useCampaignOptions();

  const [stage, setStage] = useState<LeadStage | ''>('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [branchId, setBranchId] = useSessionBranchId();
  const [campaignId, setCampaignId] = useState('');
  const [followUpDue, setFollowUpDue] = useState(false);
  const [mobileSearch, setMobileSearch] = useState('');
  const debouncedMobileSearch = useDebounce(mobileSearch, 350);

  useEffect(() => {
    if (mobile) pagination.setSearch(debouncedMobileSearch);
  }, [debouncedMobileSearch, mobile, pagination.setSearch]);

  const filters: LeadFilters = {
    stage: stage || undefined,
    source: source || undefined,
    ownerUserId: ownerUserId || undefined,
    branchId: branchId || undefined,
    campaignId: campaignId || undefined,
    followUpDue: followUpDue || undefined,
  };

  const { data, isFetching } = useLeads(pagination.query, filters);
  const pipeline = useLeadPipeline({
    source: source || undefined,
    ownerUserId: ownerUserId || undefined,
    branchId: branchId || undefined,
  });
  const changeStage = useChangeLeadStage();
  const deleteLead = useDeleteLead();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LeadItem | null>(null);
  const [converting, setConverting] = useState<LeadItem | null>(null);
  const [calling, setCalling] = useState<LeadItem | null>(null);
  const [visiting, setVisiting] = useState<LeadItem | null>(null);
  const [staging, setStaging] = useState<LeadItem | null>(null);
  const [newStage, setNewStage] = useState<Exclude<LeadStage, 'CONVERTED'>>('FOLLOW_UP');
  const [lostReason, setLostReason] = useState('');
  const [deleting, setDeleting] = useState<LeadItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, message: string): Promise<void> => {
    setError(null);
    try {
      await action();
      setNotice(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const submitStage = (): void => {
    if (!staging) return;
    const lead = staging;
    if (newStage === 'NOT_INTERESTED' && lostReason.trim().length < 3) {
      setError('A reason is required when marking a lead not interested');
      return;
    }
    void run(async () => {
      await changeStage.mutateAsync({
        id: lead.id,
        version: lead.version,
        stage: newStage,
        lostReason: newStage === 'NOT_INTERESTED' ? lostReason.trim() : undefined,
      });
      setStaging(null);
      setLostReason('');
    }, `${lead.code} moved to ${STAGE_LABELS[newStage]}.`);
  };

  const columns = useMemo<ColDef<LeadItem>[]>(
    () => [
      { field: 'code', headerName: 'Code', minWidth: 130 },
      {
        headerName: 'Lead',
        minWidth: 200,
        valueGetter: (p) =>
          p.data?.companyName ? `${p.data.name} · ${p.data.companyName}` : (p.data?.name ?? ''),
      },
      { field: 'phone', headerName: 'Phone', minWidth: 130 },
      {
        field: 'source',
        headerName: 'Source',
        minWidth: 120,
        valueFormatter: (p) => SOURCE_LABELS[p.value as LeadSource],
      },
      {
        field: 'campaignName',
        headerName: 'Campaign',
        minWidth: 140,
        valueFormatter: (p) => (p.value as string | null) ?? '—',
      },
      {
        field: 'stage',
        headerName: 'Stage',
        minWidth: 120,
        cellRenderer: (p: ICellRendererParams<LeadItem>) => {
          const lead = p.data;
          const chip = (
            <Chip
              label={STAGE_LABELS[p.value as LeadStage]}
              size="small"
              color={STAGE_COLORS[p.value as LeadStage]}
            />
          );
          if (lead?.stage === 'CONVERTED' && lead.convertedByName) {
            const when = lead.convertedAt
              ? new Date(lead.convertedAt).toLocaleDateString()
              : '';
            return (
              <Tooltip title={`Converted by ${lead.convertedByName}${when ? ` on ${when}` : ''}`}>
                {chip}
              </Tooltip>
            );
          }
          return chip;
        },
      },
      { field: 'ownerName', headerName: 'Salesman', minWidth: 130, valueFormatter: (p) => p.value ?? '—' },
      {
        field: 'expectedValue',
        headerName: 'Value',
        minWidth: 120,
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'nextFollowUpAt',
        headerName: 'Follow-up',
        minWidth: 130,
        cellRenderer: (p: ICellRendererParams<LeadItem>) => {
          if (!p.value) return <span>—</span>;
          const date = new Date(p.value as string).toLocaleDateString();
          return p.data?.followUpOverdue ? (
            <Chip label={date} size="small" color="warning" variant="outlined" />
          ) : (
            <span>{date}</span>
          );
        },
      },
      {
        headerName: '',
        minWidth: 250,
        cellRenderer: (p: ICellRendererParams<LeadItem>) => {
          const lead = p.data;
          if (!lead) return null;
          const converted = Boolean(lead.convertedQuotationId);
          return (
            <>
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={() => {
                    setEditing(lead);
                    setFormOpen(true);
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Calls">
                <IconButton size="small" color="info" onClick={() => setCalling(lead)}>
                  <PhoneIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Visits">
                <IconButton size="small" color="info" onClick={() => setVisiting(lead)}>
                  <EventIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Move stage">
                <span>
                  <IconButton
                    size="small"
                    disabled={isSettled(lead.stage)}
                    onClick={() => {
                      setStaging(lead);
                      setNewStage(lead.stage === 'NEW' ? 'FOLLOW_UP' : 'NEW');
                      setLostReason('');
                    }}
                  >
                    <MoveUpIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip
                title={converted ? 'Already converted' : 'Convert to a quotation'}
              >
                <span>
                  <IconButton
                    size="small"
                    color="primary"
                    disabled={converted || isSettled(lead.stage)}
                    onClick={() => setConverting(lead)}
                  >
                    <RequestQuoteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => setDeleting(lead)}>
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
      title="CRM leads"
      subtitle="Work a lead down the pipeline, then convert it into a quotation."
      actions={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          fullWidth={mobile}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          New lead
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

        <Paper variant="outlined" sx={{ p: { xs: 1, sm: 1.25 } }}>
          <Stack direction="row" spacing={0.75} alignItems="center" mb={1}>
            <TimelineIcon fontSize="small" color="action" />
            <Typography variant="subtitle2">Pipeline</Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            flexWrap={{ xs: 'nowrap', sm: 'wrap' }}
            useFlexGap
            sx={{ overflowX: { xs: 'auto', sm: 'visible' }, pb: { xs: 0.5, sm: 0 } }}
          >
            {(pipeline.data ?? STAGES.map((s) => ({ stage: s, count: 0, expectedValue: 0 }))).map(
              (col) => (
                <Box
                  key={col.stage}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    minWidth: 110,
                    flexShrink: 0,
                  }}
                >
                  <Chip
                    label={STAGE_LABELS[col.stage]}
                    size="small"
                    color={STAGE_COLORS[col.stage]}
                    sx={{ mb: 0.5 }}
                  />
                  <Typography variant="body2">
                    {col.count} · {money(col.expectedValue)}
                  </Typography>
                </Box>
              ),
            )}
          </Stack>
        </Paper>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fit, minmax(160px, max-content))' },
            gap: 1,
            alignItems: 'center',
          }}
        >
          <TextField
            select
            label="Stage"
            size="small"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value as LeadStage | '');
              pagination.setPage(1);
            }}
            sx={{ width: { xs: '100%', sm: 160 } }}
          >
            <MenuItem value="">All stages</MenuItem>
            {STAGES.map((s) => (
              <MenuItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Source"
            size="small"
            value={source}
            onChange={(e) => {
              setSource(e.target.value as LeadSource | '');
              pagination.setPage(1);
            }}
            sx={{ width: { xs: '100%', sm: 160 } }}
          >
            <MenuItem value="">All sources</MenuItem>
            {SOURCES.map((s) => (
              <MenuItem key={s} value={s}>
                {SOURCE_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Salesman"
            size="small"
            value={ownerUserId}
            onChange={(e) => {
              setOwnerUserId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: { xs: '100%', sm: 170 } }}
          >
            <MenuItem value="">All salesmen</MenuItem>
            {(salesmen.data ?? []).map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Branch"
            size="small"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: { xs: '100%', sm: 170 } }}
          >
            <MenuItem value="">All branches</MenuItem>
            {(branches.data ?? []).map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Campaign"
            size="small"
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: { xs: '100%', sm: 180 } }}
          >
            <MenuItem value="">All campaigns</MenuItem>
            {(campaigns.data ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={followUpDue}
                onChange={(e) => {
                  setFollowUpDue(e.target.checked);
                  pagination.setPage(1);
                }}
              />
            }
            label="Follow-up due"
            sx={{ m: 0, gridColumn: { xs: '1 / -1', sm: 'auto' } }}
          />
        </Box>

        {mobile ? (
          <Stack spacing={1}>
            <TextField
              placeholder="Search by name, company, phone or code…"
              size="small"
              fullWidth
              value={mobileSearch}
              onChange={(event) => setMobileSearch(event.target.value)}
            />
            {!isFetching && (data?.items.length ?? 0) === 0 && (
              <Alert severity="info">No leads match the selected filters.</Alert>
            )}
            {(data?.items ?? []).map((lead) => (
              <Paper key={lead.id} variant="outlined" sx={{ overflow: 'hidden' }}>
                <Stack spacing={1} sx={{ p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary">{lead.code}</Typography>
                      <Typography variant="subtitle2" fontWeight={800}>{lead.name}</Typography>
                      {lead.companyName && <Typography variant="body2" color="text.secondary">{lead.companyName}</Typography>}
                    </Box>
                    <Chip label={STAGE_LABELS[lead.stage]} size="small" color={STAGE_COLORS[lead.stage]} />
                  </Stack>
                  <Divider />
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                    <Box><Typography variant="caption" color="text.secondary">Phone</Typography><Typography variant="body2">{lead.phone || '—'}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Salesman</Typography><Typography variant="body2">{lead.ownerName || '—'}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Source</Typography><Typography variant="body2">{SOURCE_LABELS[lead.source]}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Value</Typography><Typography variant="body2" fontWeight={700}>{money(lead.expectedValue)}</Typography></Box>
                    <Box sx={{ gridColumn: '1 / -1' }}>
                      <Typography variant="caption" color="text.secondary">Follow-up</Typography>
                      <Typography variant="body2" color={lead.followUpOverdue ? 'warning.main' : 'text.primary'} fontWeight={lead.followUpOverdue ? 700 : 400}>
                        {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleDateString() : '—'}
                      </Typography>
                    </Box>
                  </Box>
                </Stack>
                <Divider />
                <Stack direction="row" justifyContent="space-around" sx={{ py: 0.5 }}>
                  <IconButton aria-label="Edit lead" onClick={() => { setEditing(lead); setFormOpen(true); }}><EditIcon /></IconButton>
                  <IconButton aria-label="Lead calls" color="info" onClick={() => setCalling(lead)}><PhoneIcon /></IconButton>
                  <IconButton aria-label="Lead visits" color="info" onClick={() => setVisiting(lead)}><EventIcon /></IconButton>
                  <IconButton aria-label="Move lead stage" disabled={isSettled(lead.stage)} onClick={() => { setStaging(lead); setNewStage(lead.stage === 'NEW' ? 'FOLLOW_UP' : 'NEW'); setLostReason(''); }}><MoveUpIcon /></IconButton>
                  <IconButton aria-label="Convert lead" color="primary" disabled={Boolean(lead.convertedQuotationId) || isSettled(lead.stage)} onClick={() => setConverting(lead)}><RequestQuoteIcon /></IconButton>
                  <IconButton aria-label="Delete lead" color="error" onClick={() => setDeleting(lead)}><DeleteIcon /></IconButton>
                </Stack>
              </Paper>
            ))}
            <TablePagination
              component="div"
              count={data?.meta.totalItems ?? 0}
              page={(data?.meta.page ?? 1) - 1}
              rowsPerPage={data?.meta.pageSize ?? 25}
              rowsPerPageOptions={[25, 50, 100]}
              onPageChange={(_, page) => pagination.setPage(page + 1)}
              onRowsPerPageChange={(event) => pagination.setPageSize(Number(event.target.value))}
              labelRowsPerPage="Rows"
              sx={{ '& .MuiTablePagination-toolbar': { px: 0, flexWrap: 'wrap', justifyContent: 'flex-end' } }}
            />
          </Stack>
        ) : (
          <DataTable
            rows={data?.items ?? []}
            columns={columns}
            meta={data?.meta}
            pagination={pagination}
            loading={isFetching}
            searchPlaceholder="Search by name, company, phone or code…"
            height={540}
          />
        )}
      </Stack>

      <LeadFormDialog
        open={formOpen}
        lead={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(message) => setNotice(message)}
      />

      <ConvertLeadDialog
        open={converting !== null}
        lead={converting}
        onClose={() => setConverting(null)}
        onConverted={(message) => setNotice(message)}
      />

      <CallLogDialog
        open={calling !== null}
        lead={calling}
        onClose={() => setCalling(null)}
        onLogged={(message) => setNotice(message)}
      />

      <VisitDialog
        open={visiting !== null}
        lead={visiting}
        onClose={() => setVisiting(null)}
        onChanged={(message) => setNotice(message)}
      />

      <Dialog open={staging !== null} onClose={() => setStaging(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Move {staging?.code}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField
              select
              label="New stage"
              size="small"
              value={newStage}
              onChange={(e) => setNewStage(e.target.value as Exclude<LeadStage, 'CONVERTED'>)}
            >
              {HAND_STAGES.map((s) => (
                <MenuItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            {newStage === 'NOT_INTERESTED' && (
              <TextField
                label="Reason *"
                size="small"
                multiline
                minRows={2}
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setStaging(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitStage} disabled={changeStage.isPending}>
            Move
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete lead"
        message={`Delete ${deleting?.code}? This cannot be undone from here.`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const lead = deleting;
          setDeleting(null);
          if (lead) void run(() => deleteLead.mutateAsync(lead.id), `${lead.code} deleted.`);
        }}
      />
    </PageContainer>
  );
}
