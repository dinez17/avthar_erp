import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import { PERMISSIONS } from '@tiles-erp/config';
import type {
  SixOrbitDirection,
  SixOrbitEntityHealth,
  SixOrbitEntityType,
  SixOrbitSyncLogItem,
  SixOrbitSyncLogQuery,
} from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError } from '../../lib/api-client';
import { downloadCsv } from '../../lib/download';
import { usePruneSixOrbitSyncLog, useSixOrbitSyncHealth, useSixOrbitSyncLog } from './api';

const ENTITY_TYPES: SixOrbitEntityType[] = [
  'CONNECTION',
  'MASTER',
  'CUSTOMER',
  'PRODUCT',
  'SALES_ORDER',
];

const ENTITY_LABELS: Record<SixOrbitEntityType, string> = {
  CONNECTION: 'Connection',
  MASTER: 'Masters',
  CUSTOMER: 'Customers',
  PRODUCT: 'Products',
  SALES_ORDER: 'Sales orders',
};

type OutcomeFilter = 'all' | 'failures' | 'successes';

const WINDOW_OPTIONS = [
  { value: 1, label: 'Last hour' },
  { value: 24, label: 'Last 24 hours' },
  { value: 168, label: 'Last 7 days' },
  { value: 720, label: 'Last 30 days' },
];

const RETENTION_OPTIONS = [30, 90, 180, 365];

/** "never" reads better than an empty cell when the answer is that it has never worked. */
function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Indented JSON, or the original text when it is not JSON.
 *
 * A payload stored at 4 KB is often cut mid-object, so parsing has to be allowed to fail:
 * a truncated body read as one unbroken line is still the evidence somebody came here for.
 */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function StatTile({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: 'error' | 'warning';
}): JSX.Element {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" color={tone ? `${tone}.main` : 'text.primary'}>
          {value}
        </Typography>
        {caption && (
          <Typography variant="caption" color="text.secondary">
            {caption}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function EntityRow({ entity }: { entity: SixOrbitEntityHealth }): JSX.Element {
  const stale = entity.failures > 0 && entity.successes === 0;
  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      justifyContent="space-between"
      sx={{ py: 0.75 }}
    >
      <Typography variant="body2" sx={{ minWidth: 110 }}>
        {ENTITY_LABELS[entity.entityType]}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip
          size="small"
          label={`${entity.successes} ok`}
          color={entity.successes ? 'success' : 'default'}
        />
        <Chip
          size="small"
          label={`${entity.failures} failed`}
          color={entity.failures ? (stale ? 'error' : 'warning') : 'default'}
        />
      </Stack>
      <Tooltip title={entity.lastSuccessAt ?? 'No successful sync on record'}>
        <Typography
          variant="caption"
          color={entity.lastSuccessAt ? 'text.secondary' : 'error.main'}
        >
          last ok {relativeTime(entity.lastSuccessAt)}
        </Typography>
      </Tooltip>
    </Stack>
  );
}

export function SyncConsolePage(): JSX.Element {
  const { hasPermission } = useAuth();
  const canPrune = hasPermission(PERMISSIONS.SIXORBIT_CONFIGURE);

  const pagination = usePagination();
  const [entityType, setEntityType] = useState<SixOrbitEntityType | ''>('');
  const [direction, setDirection] = useState<SixOrbitDirection | ''>('');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [windowHours, setWindowHours] = useState(24);
  const [viewing, setViewing] = useState<SixOrbitSyncLogItem | null>(null);
  const [pruneDays, setPruneDays] = useState(90);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo<SixOrbitSyncLogQuery>(
    () => ({
      page: pagination.query.page,
      pageSize: pagination.query.pageSize,
      search: pagination.query.search,
      entityType: entityType || undefined,
      success: outcome === 'all' ? undefined : outcome === 'successes',
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    }),
    [pagination.query, entityType, outcome, from, to],
  );

  const { data, isFetching } = useSixOrbitSyncLog(query);
  const health = useSixOrbitSyncHealth(windowHours);
  const prune = usePruneSixOrbitSyncLog();

  // The direction filter is applied here rather than server-side: it is the one facet the
  // list endpoint does not take, and the page is already server-paginated on the rest.
  const rows = useMemo(
    () => (data?.items ?? []).filter((row) => !direction || row.direction === direction),
    [data, direction],
  );

  const resetToFirstPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      pagination.setPage(1);
    };

  const columns = useMemo<ColDef<SixOrbitSyncLogItem>[]>(
    () => [
      {
        field: 'createdAt',
        headerName: 'When',
        minWidth: 165,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleString() : ''),
      },
      {
        field: 'success',
        headerName: 'Outcome',
        maxWidth: 110,
        cellRenderer: (p: ICellRendererParams<SixOrbitSyncLogItem>) => (
          <Chip
            size="small"
            label={p.data?.success ? 'ok' : 'failed'}
            color={p.data?.success ? 'success' : 'error'}
          />
        ),
      },
      {
        field: 'entityType',
        headerName: 'Entity',
        maxWidth: 130,
        valueFormatter: (p) => ENTITY_LABELS[p.value as SixOrbitEntityType] ?? String(p.value),
      },
      { field: 'task', headerName: 'Task', minWidth: 220 },
      { field: 'direction', headerName: 'Way', maxWidth: 90 },
      { field: 'attempt', headerName: 'Try', maxWidth: 70 },
      { field: 'resultCode', headerName: 'Code', maxWidth: 90 },
      { field: 'message', headerName: 'Message', minWidth: 260 },
      {
        field: 'durationMs',
        headerName: 'ms',
        maxWidth: 90,
        valueFormatter: (p) => (p.value === null ? '' : String(p.value)),
      },
      {
        headerName: '',
        maxWidth: 60,
        cellRenderer: (p: ICellRendererParams<SixOrbitSyncLogItem>) => (
          <IconButton
            size="small"
            aria-label="View attempt"
            onClick={() => p.data && setViewing(p.data)}
          >
            <VisibilityIcon fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [],
  );

  const exportCsv = (): void => {
    downloadCsv(
      `sixorbit-sync-log-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'When',
        'Outcome',
        'Entity',
        'Record',
        'Their id',
        'Task',
        'Direction',
        'Attempt',
        'Code',
        'Message',
        'Duration ms',
        'Request',
      ],
      rows.map((r) => [
        r.createdAt,
        r.success ? 'ok' : 'failed',
        r.entityType,
        r.entityId,
        r.externalId,
        r.task,
        r.direction,
        r.attempt,
        r.resultCode,
        r.message,
        r.durationMs,
        // Already redacted server-side; exporting it cannot leak a credential.
        r.requestSummary,
      ]),
    );
  };

  const runPrune = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    try {
      const result = await prune.mutateAsync(pruneDays);
      setNotice(
        result.deleted === 0
          ? `Nothing older than ${result.olderThanDays} days to remove.`
          : `Removed ${result.deleted} attempts older than ${result.olderThanDays} days.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not prune the log');
    } finally {
      setPruneOpen(false);
    }
  };

  const summary = health.data;

  return (
    <PageContainer
      title="SixOrbit sync console"
      subtitle="Every call made to SixOrbit, and what came back."
    >
      <Stack spacing={2}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        <Stack direction="row" spacing={1.5} alignItems="center">
          <TextField
            select
            size="small"
            label="Health window"
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value))}
            sx={{ width: 180 }}
          >
            {WINDOW_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          {summary && (
            <Typography variant="caption" color="text.secondary">
              as at {new Date(summary.generatedAt).toLocaleTimeString()}
            </Typography>
          )}
        </Stack>

        {summary && (
          <Grid container spacing={1.5}>
            <Grid item xs={6} md={3}>
              <StatTile label="Attempts" value={String(summary.totalAttempts)} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatTile
                label="Failures"
                value={String(summary.totalFailures)}
                tone={summary.totalFailures > 0 ? 'warning' : undefined}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatTile
                label="Records stuck"
                value={String(summary.failingRecords)}
                caption="last attempt failed"
                tone={summary.failingRecords > 0 ? 'error' : undefined}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatTile
                label="Response time"
                value={`${summary.averageDurationMs} ms`}
                caption={`slowest ${summary.slowestDurationMs} ms`}
              />
            </Grid>
          </Grid>
        )}

        {summary && (
          <Card variant="outlined">
            <CardContent sx={{ py: 1 }}>
              {summary.byEntity.map((entity, index) => (
                <Box key={entity.entityType}>
                  {index > 0 && <Divider />}
                  <EntityRow entity={entity} />
                </Box>
              ))}
            </CardContent>
          </Card>
        )}

        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
          <TextField
            select
            size="small"
            label="Entity"
            value={entityType}
            onChange={(e) =>
              resetToFirstPage(setEntityType)(e.target.value as SixOrbitEntityType | '')
            }
            sx={{ width: 160 }}
          >
            <MenuItem value="">All</MenuItem>
            {ENTITY_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {ENTITY_LABELS[type]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Outcome"
            value={outcome}
            onChange={(e) => resetToFirstPage(setOutcome)(e.target.value as OutcomeFilter)}
            sx={{ width: 150 }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="failures">Failures only</MenuItem>
            <MenuItem value="successes">Successes only</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="Direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as SixOrbitDirection | '')}
            sx={{ width: 140 }}
          >
            <MenuItem value="">Both</MenuItem>
            <MenuItem value="PUSH">Push</MenuItem>
            <MenuItem value="PULL">Pull</MenuItem>
          </TextField>

          <TextField
            type="datetime-local"
            size="small"
            label="From"
            value={from}
            onChange={(e) => resetToFirstPage(setFrom)(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 210 }}
          />
          <TextField
            type="datetime-local"
            size="small"
            label="To"
            value={to}
            onChange={(e) => resetToFirstPage(setTo)(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 210 }}
          />

          <Button
            size="small"
            startIcon={<DownloadIcon />}
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            Export page
          </Button>
        </Stack>

        <DataTable
          rows={rows}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search task, message or their id…"
        />

        {canPrune && (
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="subtitle2">Retention</Typography>
                <Typography variant="body2" color="text.secondary">
                  One row is written per attempt, and a catalogue pull is thousands of them.
                  Removing old attempts is deliberate rather than automatic, so nobody discovers
                  that last month&apos;s evidence was swept away by a default they never chose.
                </Typography>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <TextField
                    select
                    size="small"
                    label="Keep"
                    value={pruneDays}
                    onChange={(e) => setPruneDays(Number(e.target.value))}
                    sx={{ width: 160 }}
                  >
                    {RETENTION_OPTIONS.map((days) => (
                      <MenuItem key={days} value={days}>
                        {days} days
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    color="error"
                    variant="outlined"
                    size="small"
                    disabled={prune.isPending}
                    onClick={() => setPruneOpen(true)}
                  >
                    Delete older attempts
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>

      <Dialog open={viewing !== null} onClose={() => setViewing(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {viewing?.task}{' '}
          <Chip
            size="small"
            label={viewing?.success ? 'ok' : 'failed'}
            color={viewing?.success ? 'success' : 'error'}
          />
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="caption" color="text.secondary">
              {viewing && new Date(viewing.createdAt).toLocaleString()} · {viewing?.direction} ·
              attempt {viewing?.attempt} · {viewing?.durationMs} ms
              {viewing?.resultCode ? ` · result_code ${viewing.resultCode}` : ''}
              {viewing?.jobId ? ` · job ${viewing.jobId}` : ''}
            </Typography>

            {viewing?.message && (
              <Alert severity={viewing.success ? 'info' : 'error'}>{viewing.message}</Alert>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary">
                Request — credentials masked before storage
              </Typography>
              <Box
                component="pre"
                sx={{
                  mt: 0.5,
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: 12.5,
                  maxHeight: 160,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {viewing?.requestSummary ?? '—'}
              </Box>
            </Box>

            {viewing?.requestBody && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Payload sent — the JSON in their `data` field, first 4 KB
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    mt: 0.5,
                    p: 1.5,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    overflow: 'auto',
                    fontSize: 12.5,
                    maxHeight: 320,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {prettyJson(viewing.requestBody)}
                </Box>
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary">
                Response — first 4 KB
              </Typography>
              <Box
                component="pre"
                sx={{
                  mt: 0.5,
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: 12.5,
                  maxHeight: 320,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {viewing?.responseBody ?? '—'}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pruneOpen}
        title="Delete older attempts?"
        message={`Every sync attempt older than ${pruneDays} days will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void runPrune()}
        onCancel={() => setPruneOpen(false)}
      />
    </PageContainer>
  );
}
