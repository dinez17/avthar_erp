import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { PageContainer, ConfirmDialog } from '@tiles-erp/ui';
import { PERMISSIONS } from '@tiles-erp/config';
import type { SixOrbitImportResult, SixOrbitMappingWarning } from '@tiles-erp/shared-types';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError } from '../../lib/api-client';
import {
  useClearSixOrbitImport,
  useDrySixOrbitImport,
  useSixOrbitImportStatus,
  useStartSixOrbitImport,
} from './api';

/**
 * Plain language for each mapper warning.
 *
 * The point of the worklist is that someone who did not write the importer can act on it,
 * so the screen never shows the enum.
 */
const WARNING_LABELS: Record<SixOrbitMappingWarning, string> = {
  MISSING_GEOMETRY: 'No pieces-per-box or area — cannot be sold by the square foot',
  AREA_DISAGREES_WITH_SIZE: "Stated area disagrees with the tile's own size",
  MISSING_PRICE: 'No selling price',
  COST_NOT_BELOW_PRICE: 'Landing cost is at or above the selling price',
  COST_IMPLAUSIBLY_LOW: 'Landing cost looks unmaintained against the price',
};

function ResultPanel({ result }: { result: SixOrbitImportResult }): JSX.Element {
  const warnings = Object.entries(result.warningCounts) as [SixOrbitMappingWarning, number][];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Chip label={`${result.fetched} fetched`} />
        {result.total !== null && result.total !== result.fetched && (
          <Chip label={`${result.total} in SixOrbit`} variant="outlined" />
        )}
        <Chip color="success" label={`${result.productsCreated} products created`} />
        <Chip color="info" label={`${result.productsUpdated} products updated`} />
        <Chip variant="outlined" label={`${result.brandsCreated} brands created`} />
        <Chip variant="outlined" label={`${result.categoriesCreated} categories created`} />
        {result.flagged > 0 && <Chip color="warning" label={`${result.flagged} flagged`} />}
        {result.skipped.length > 0 && (
          <Chip color="error" label={`${result.skipped.length} skipped`} />
        )}
        <Chip variant="outlined" label={`${(result.durationMs / 1000).toFixed(1)}s`} />
      </Stack>

      {warnings.length > 0 && (
        <div>
          <Typography variant="subtitle2" gutterBottom>
            Imported, but worth checking
          </Typography>
          <Table size="small">
            <TableBody>
              {warnings.map(([warning, count]) => (
                <TableRow key={warning}>
                  <TableCell>{WARNING_LABELS[warning] ?? warning}</TableCell>
                  <TableCell align="right" sx={{ width: 90 }}>
                    {count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {result.skipped.length > 0 && (
        <div>
          <Typography variant="subtitle2" gutterBottom>
            Not imported
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.skipped.slice(0, 50).map((skip) => (
                <TableRow key={skip.sixorbitId}>
                  <TableCell>{skip.name || skip.sixorbitId}</TableCell>
                  <TableCell>{skip.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result.skipped.length > 50 && (
            <Typography variant="caption" color="text.secondary">
              Showing the first 50 of {result.skipped.length}.
            </Typography>
          )}
        </div>
      )}
    </Stack>
  );
}

export function ProductImportPage(): JSX.Element {
  const { hasPermission } = useAuth();
  const canSync = hasPermission(PERMISSIONS.SIXORBIT_SYNC);

  const [since, setSince] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SixOrbitImportResult | null>(null);

  const dryRun = useDrySixOrbitImport();
  const start = useStartSixOrbitImport();
  const clear = useClearSixOrbitImport();

  const { data: status } = useSixOrbitImportStatus(true);
  const running = status?.state === 'RUNNING';

  const run = async (real: boolean): Promise<void> => {
    setError(null);
    try {
      if (real) {
        await start.mutateAsync(since || null);
        setPreview(null);
      } else {
        setPreview(await dryRun.mutateAsync(since || null));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The import could not be started');
    }
  };

  // The queue distinguishes the two failures a progress record cannot: nobody consuming
  // the job, versus a worker that took it and blew up. They need opposite responses.
  const noWorker =
    running && (status?.queue?.waiting ?? 0) > 0 && (status?.queue?.active ?? 0) === 0;
  const queueFailure = status?.queue?.lastFailureReason ?? null;

  // Only after the queue has ruled out the two definite failures: a job taken and being
  // worked on, but with nothing to show for it yet.
  const stalled =
    running &&
    status?.processed === 0 &&
    status.startedAt !== null &&
    Date.now() - new Date(status.startedAt).getTime() > 120_000;

  const percent =
    status && status.totalToProcess > 0
      ? Math.round((status.processed / status.totalToProcess) * 100)
      : 0;

  return (
    <PageContainer
      title="SixOrbit product import"
      subtitle="Pull their catalogue into TilesERP. Brands and categories come from the products themselves."
    >
      <Stack spacing={2} sx={{ maxWidth: 900 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <TextField
                label="Only changes since"
                type="datetime-local"
                size="small"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                sx={{ maxWidth: 260 }}
                InputLabelProps={{ shrink: true }}
                helperText="Leave empty for the whole catalogue — which the first run has to be."
              />

              <Divider />

              <Stack direction="row" spacing={1.5} alignItems="center">
                <Button
                  variant="outlined"
                  disabled={dryRun.isPending}
                  onClick={() => void run(false)}
                >
                  {dryRun.isPending ? 'Checking…' : 'Dry run'}
                </Button>
                <Button
                  variant="contained"
                  disabled={!canSync || running || start.isPending}
                  onClick={() => setConfirming(true)}
                >
                  Run import
                </Button>
                {!canSync && (
                  <Typography variant="caption" color="text.secondary">
                    You can preview an import but not run one.
                  </Typography>
                )}
              </Stack>

              <Typography variant="caption" color="text.secondary">
                A dry run reads SixOrbit and your catalogue and writes nothing. It takes about as
                long as the real thing, because it does the same reading.
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {running && (
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">
                    Import running
                    {status?.startedByName ? ` — started by ${status.startedByName}` : ''}
                  </Typography>
                  {/* Always offered. A record stuck at RUNNING would otherwise disable
                      every button on this page until it expired hours later. */}
                  <Button size="small" onClick={() => void clear.mutateAsync()}>
                    Clear
                  </Button>
                </Stack>
                <LinearProgress
                  variant={status && status.totalToProcess > 0 ? 'determinate' : 'indeterminate'}
                  value={percent}
                />
                <Typography variant="caption" color="text.secondary">
                  {status && status.totalToProcess > 0
                    ? `${status.processed} of ${status.totalToProcess} rows`
                    : 'Fetching the catalogue from SixOrbit…'}
                </Typography>

                {noWorker && (
                  <Alert severity="error">
                    <AlertTitle>No worker is consuming the queue</AlertTitle>
                    The job is sitting in the queue ({status?.queue?.waiting} waiting, none active),
                    so the worker process is not running — or is running a build from before the
                    SixOrbit processor existed. Stop it, run <code>pnpm build</code>, and start it
                    again.
                  </Alert>
                )}

                {queueFailure && (
                  <Alert severity="error">
                    <AlertTitle>A worker took the job and it failed</AlertTitle>
                    <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {queueFailure}
                    </Box>
                  </Alert>
                )}

                {status?.queue === null && (
                  <Alert severity="error">
                    <AlertTitle>The queue cannot be reached</AlertTitle>
                    The API could not read Redis. If the API cannot reach it, neither can the worker
                    — check that Redis is running.
                  </Alert>
                )}

                {stalled && !noWorker && !queueFailure && (
                  <Alert severity="warning">
                    <AlertTitle>Nothing has happened for a while</AlertTitle>A worker has taken the
                    job but no rows have come back yet. Clearing this only discards the progress
                    record — work genuinely in flight carries on.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}

        {status?.state === 'FAILED' && (
          <Alert severity="error" onClose={() => void clear.mutateAsync()}>
            <AlertTitle>The import failed</AlertTitle>
            {status.error}
          </Alert>
        )}

        {preview && (
          <Card>
            <CardContent>
              <Alert severity="info" sx={{ mb: 2 }}>
                <AlertTitle>Dry run — nothing was written</AlertTitle>
                This is what running the import would do.
              </Alert>
              <ResultPanel result={preview} />
            </CardContent>
          </Card>
        )}

        {status?.state === 'DONE' && status.result && (
          <Card>
            <CardContent>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Typography variant="subtitle1">
                  Last import
                  {status.finishedAt ? ` — ${new Date(status.finishedAt).toLocaleString()}` : ''}
                </Typography>
                <Button size="small" onClick={() => void clear.mutateAsync()}>
                  Clear
                </Button>
              </Stack>
              <ResultPanel result={status.result} />
            </CardContent>
          </Card>
        )}
      </Stack>

      <ConfirmDialog
        open={confirming}
        title="Run the SixOrbit import?"
        message={
          since
            ? 'Products changed in SixOrbit since that moment will be created or updated here.'
            : 'The whole SixOrbit catalogue will be created or updated here. Existing products are matched by their SixOrbit id, then by SKU.'
        }
        confirmLabel="Run import"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void run(true);
        }}
      />
    </PageContainer>
  );
}
