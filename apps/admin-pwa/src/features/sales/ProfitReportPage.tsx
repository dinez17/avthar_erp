import DownloadIcon from '@mui/icons-material/Download';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@tiles-erp/ui';
import type { ProfitGrouping, ProfitReport, ProfitRow } from '@tiles-erp/shared-types';
import { useBranches } from '../products/branch-prices-api';
import { useAreaAudit, useProfitReport } from './profit-api';

const money = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

const localDay = (date: Date): string => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};

const monthStart = (): string => {
  const now = new Date();
  return localDay(new Date(now.getFullYear(), now.getMonth(), 1));
};

/**
 * Whether a row has any cost behind it at all.
 *
 * A line with no cost recorded is not a line that cost nothing — showing 0.00 and 100%
 * turns a missing figure into a confident wrong one, which is worse than a dash. Rows
 * that are only partly covered do report a margin, marked as understated.
 */
const knowsCost = (row: ProfitRow): boolean => row.revenueWithoutCost < row.revenue;
const fullyCosted = (row: ProfitRow): boolean => row.revenueWithoutCost === 0;

const GROUPINGS: { value: ProfitGrouping; label: string }[] = [
  { value: 'INVOICE', label: 'By invoice' },
  { value: 'PRODUCT', label: 'By product' },
  { value: 'BRANCH', label: 'By branch' },
  { value: 'SALESMAN', label: 'By salesman' },
];

const csvOf = (report: ProfitReport): string => {
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const header = ['', 'Detail', 'Boxes', 'Revenue', 'Cost', 'Margin', 'Margin %'];
  const rows = report.rows.map((row) => [
    row.label,
    row.subLabel ?? '',
    row.qtyBoxes.toFixed(3),
    row.revenue.toFixed(2),
    row.cost.toFixed(2),
    row.margin.toFixed(2),
    row.marginPct.toFixed(2),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => escape(String(cell))).join(','))
    .join('\n');
};

/**
 * What was sold, what it cost, and the difference.
 *
 * Cost is the figure frozen on each invoice line when it was posted, so this page gives
 * the same answer for last quarter whenever it is run. Thinnest margin sorts first: a
 * report read top-down should open on what needs attention.
 */
export function ProfitReportPage(): JSX.Element {
  const navigate = useNavigate();
  const [grouping, setGrouping] = useState<ProfitGrouping>('INVOICE');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDay(new Date()));
  const [branchId, setBranchId] = useState('');

  const branches = useBranches();
  const { data: report, isLoading } = useProfitReport({ grouping, from, to, branchId });
  const { data: audit } = useAreaAudit();

  const download = (): void => {
    if (!report) return;
    const blob = new Blob([csvOf(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `profit-${grouping.toLowerCase()}-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer
      title="Profit"
      subtitle="Revenue against what the goods cost, from the figure frozen when each invoice was posted"
      actions={
        <Button startIcon={<DownloadIcon />} disabled={!report?.rows.length} onClick={download}>
          CSV
        </Button>
      }
    >
      {/*
        A wrong sq.ft per box distorts stock valuation and every per-sq.ft price, so it is
        worth saying here rather than letting someone act on a margin built on it.
      */}
      {audit && audit.rows.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/product-audit')}>
              Review
            </Button>
          }
        >
          {audit.rows.length} product{audit.rows.length === 1 ? ' has' : 's have'} a sq.ft per
          box that disagrees with their own size. Anything measured per sq.ft — valuation,
          rates, these margins — is unreliable until they are corrected.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            type="date"
            size="small"
            label="From"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            size="small"
            label="To"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            select
            size="small"
            label="Branch"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Every branch</MenuItem>
            {(branches.data ?? []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      {report && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <Figure label="Revenue" value={report.revenue} note="Goods value, before GST" />
          <Figure
            label="Cost"
            value={report.cost}
            note="At landing cost when sold"
            unknown={report.revenueWithoutCost >= report.revenue}
          />
          <Figure
            label="Margin"
            value={report.margin}
            tone={report.margin < 0 ? 'error.main' : 'success.main'}
            strong
            unknown={report.revenueWithoutCost >= report.revenue}
          />
          <Figure
            label="Margin %"
            value={report.marginPct}
            note="Of revenue"
            tone={report.marginPct < 0 ? 'error.main' : undefined}
            suffix="%"
            unknown={report.revenueWithoutCost >= report.revenue}
          />
        </Stack>
      )}

      {report && report.linesEstimated > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {money(report.revenueEstimatedCost)} of this revenue has an <strong>estimated</strong>{' '}
          cost — filled in afterwards from each product&apos;s landing cost, because those
          invoices were posted before cost was captured. It is today&apos;s cost against an
          older sale price, so treat the margin as close rather than exact. Invoices posted
          from now on freeze their cost at posting and need no estimate.
        </Alert>
      )}

      {report && report.linesWithoutCost > 0 && (
        <Alert
          severity={report.revenueWithoutCost >= report.revenue ? 'warning' : 'info'}
          sx={{ mb: 2 }}
        >
          {report.revenueWithoutCost >= report.revenue ? (
            <>
              <strong>No margin can be shown for this period.</strong> None of these{' '}
              {report.linesWithoutCost} invoice lines has a cost recorded — they were posted
              before cost was captured. Cost is frozen onto a line when its invoice is
              posted, so invoices raised from now on will report properly.
            </>
          ) : (
            <>
              {money(report.revenueWithoutCost)} of this revenue is on{' '}
              {report.linesWithoutCost} line{report.linesWithoutCost === 1 ? '' : 's'} with no
              cost recorded. Margins marked <strong>*</strong> are understated against the
              full revenue of that row.
            </>
          )}
        </Alert>
      )}

      <Paper variant="outlined">
        <Tabs
          value={grouping}
          onChange={(_, next: ProfitGrouping) => setGrouping(next)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {GROUPINGS.map((option) => (
            <Tab key={option.value} value={option.value} label={option.label} />
          ))}
        </Tabs>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{GROUPINGS.find((g) => g.value === grouping)?.label.slice(3)}</TableCell>
              <TableCell align="right">Boxes</TableCell>
              <TableCell align="right">Revenue</TableCell>
              <TableCell align="right">Cost</TableCell>
              <TableCell align="right">Margin</TableCell>
              <TableCell align="right">Margin %</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(report?.rows ?? []).map((row) => (
              <TableRow key={row.key} hover>
                <TableCell>
                  <Typography variant="body2">{row.label}</Typography>
                  {row.subLabel && (
                    <Typography variant="caption" color="text.secondary">
                      {row.subLabel}
                    </Typography>
                  )}
                  {row.revenueWithoutCost > 0 && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="info"
                      sx={{ ml: 1 }}
                      label={`${money(row.revenueWithoutCost)} without cost`}
                    />
                  )}
                  {row.revenueEstimatedCost > 0 && (
                    <Tooltip title="Cost filled in afterwards from the product's landing cost, not captured when the invoice was posted">
                      <Chip
                        size="small"
                        variant="outlined"
                        sx={{ ml: 1 }}
                        label="estimated cost"
                      />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell align="right">{row.qtyBoxes.toLocaleString('en-IN')}</TableCell>
                <TableCell align="right">{money(row.revenue)}</TableCell>
                <TableCell align="right">
                  {knowsCost(row) ? (
                    <Typography variant="body2">{money(row.cost)}</Typography>
                  ) : (
                    <Tooltip title="No cost recorded on any line of this row">
                      <Typography variant="body2" color="text.disabled">
                        Not recorded
                      </Typography>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell align="right">
                  {knowsCost(row) ? (
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={row.margin < 0 ? 'error.main' : 'text.primary'}
                    >
                      {money(row.margin)}
                      {!fullyCosted(row) && '*'}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  {knowsCost(row) ? (
                    <Typography
                      variant="body2"
                      color={
                        row.marginPct < 0
                          ? 'error.main'
                          : row.marginPct < 5
                            ? 'warning.main'
                            : 'success.main'
                      }
                    >
                      {row.marginPct.toFixed(1)}%
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      —
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}

            {report && report.rows.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No posted invoices between these dates.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {report && report.rows.length > 0 && (
              <TableRow>
                <TableCell colSpan={2} align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Total
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    {money(report.revenue)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    {money(report.cost)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700}>
                    {money(report.margin)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700}>
                    {report.marginPct.toFixed(1)}%
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Revenue is the goods value before GST. Freight, loading and unloading are left out —
        they are costs recovered, not margin earned. Thinnest margin sorts first.
      </Typography>
    </PageContainer>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
  strong,
  suffix,
  unknown,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: string;
  strong?: boolean;
  suffix?: string;
  /** Nothing behind this figure — say so instead of printing a zero. */
  unknown?: boolean;
}): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box>
        <Typography
          variant="h6"
          color={unknown ? 'text.disabled' : tone}
          fontWeight={strong ? 700 : 500}
        >
          {unknown ? 'Not recorded' : suffix === '%' ? `${value.toFixed(1)}%` : money(value)}
        </Typography>
      </Box>
      {note && (
        <Typography variant="caption" color="text.secondary">
          {note}
        </Typography>
      )}
    </Paper>
  );
}
