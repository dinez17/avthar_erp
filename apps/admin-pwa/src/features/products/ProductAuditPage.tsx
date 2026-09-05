import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { useAreaAudit, useFixArea } from '../sales/profit-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const area = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Products whose recorded sq.ft per box disagrees with the size on their own box.
 *
 * The figure is typed by hand and nothing downstream questions it, so a box recorded at
 * 3,600 sq.ft instead of 11.63 makes stock valuation, margin and every per-sq.ft price
 * silently absurd — and stays invisible until somebody reads a report and does not
 * believe it.
 */
export function ProductAuditPage(): JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: audit, isLoading } = useAreaAudit();
  const fix = useFixArea();

  const rows = audit?.rows ?? [];
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (productId: string): void =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

  const toggleAll = (): void =>
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.productId)));

  const apply = async (): Promise<void> => {
    setError(null);
    try {
      const result = await fix.mutateAsync(
        selected.size > 0 ? [...selected] : undefined,
      );
      setNote(
        `${result.fixed} product${result.fixed === 1 ? '' : 's'} corrected. Stock valuation and any per-sq.ft rates have moved with them.`,
      );
      setSelected(new Set());
      setConfirming(false);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not correct those products');
    }
  };

  return (
    <PageContainer
      title="Product data audit"
      subtitle="Products whose sq.ft per box disagrees with their own size"
      actions={
        <Button
          variant="contained"
          startIcon={<AutoFixHighIcon />}
          disabled={rows.length === 0}
          onClick={() => setConfirming(true)}
        >
          {selected.size > 0 ? `Correct ${selected.size} selected` : 'Correct all'}
        </Button>
      }
    >
      {note && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNote(null)}>
          {note}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {audit && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Chip label={`${audit.checked} checked`} />
          <Chip
            color={rows.length > 0 ? 'warning' : 'success'}
            label={rows.length > 0 ? `${rows.length} suspect` : 'All agree with their size'}
          />
          {audit.unreadable > 0 && (
            <Chip
              variant="outlined"
              label={`${audit.unreadable} skipped — size could not be read`}
            />
          )}
        </Stack>
      )}

      {audit && rows.length === 0 && !isLoading && (
        <Alert severity="success">
          Every product with a readable size records an area that matches it. Nothing to fix.
        </Alert>
      )}

      {rows.length > 0 && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={selected.size > 0 && !allSelected}
                    onChange={toggleAll}
                  />
                </TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Size</TableCell>
                <TableCell align="right">Pcs/box</TableCell>
                <TableCell align="right">Recorded</TableCell>
                <TableCell align="right">Should be</TableCell>
                <TableCell align="right">Out by</TableCell>
                <TableCell align="right">In stock</TableCell>
                <TableCell>Likely cause</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.productId} hover selected={selected.has(row.productId)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.has(row.productId)}
                      onChange={() => toggle(row.productId)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {row.sku}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {row.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{row.sizeMm ?? '—'}</TableCell>
                  <TableCell align="right">{row.piecesPerBox}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="error.main">
                      {area(row.storedSqftPerBox)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="success.main" fontWeight={600}>
                      {area(row.expectedSqftPerBox)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {row.ratio >= 1
                        ? `${row.ratio.toFixed(row.ratio > 10 ? 0 : 2)}×`
                        : `÷${(1 / row.ratio).toFixed(1)}`}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {row.stockBoxes > 0 ? (
                      <Typography variant="body2" fontWeight={600}>
                        {money(row.stockBoxes)}
                      </Typography>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{row.likelyCause}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        A tolerance of 10% is allowed, because a &ldquo;600x600&rdquo; tile is really 597x597
        and the trade rounds. Only differences too large to be rounding are listed. Worst
        first, by the error multiplied by what is held.
      </Typography>

      <Dialog open={confirming} onClose={() => setConfirming(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Correct {selected.size > 0 ? `${selected.size} product` : `all ${rows.length} product`}
          {(selected.size > 0 ? selected.size : rows.length) === 1 ? '' : 's'}?
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              The recorded area is replaced with the figure each product&apos;s own size
              implies. Only the products listed here are touched.
            </Typography>
            <Alert severity="warning">
              Stock valuation, per-sq.ft rates and past margins all move with this. That is
              the point — they are wrong now — but expect the numbers to change.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="contained" disabled={fix.isPending} onClick={() => void apply()}>
            Correct
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
