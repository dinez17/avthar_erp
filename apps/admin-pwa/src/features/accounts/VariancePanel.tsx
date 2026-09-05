import {
  Alert,
  Chip,
  Paper,
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
import { useVarianceReport } from './api';

const money = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

const day = (iso: string): string => new Date(iso).toLocaleDateString('en-IN');

const localDay = (date: Date): string => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};

const daysAgo = (count: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return localDay(date);
};

/**
 * How the counts have gone, one line per account.
 *
 * A single short day is a mistake and not worth a conversation. The same till short most
 * weeks is something else, and only a run of days can tell the two apart — which is the
 * whole reason a count is written down rather than just corrected and forgotten.
 */
export function VariancePanel(): JSX.Element {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(localDay(new Date()));
  const { data: report } = useVarianceReport(from, to);

  return (
    <Paper variant="outlined" sx={{ mt: 3 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ sm: 'center' }}
        sx={{ p: 2, pb: 1 }}
      >
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          How the counts have gone
        </Typography>
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
      </Stack>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Account</TableCell>
            <TableCell align="right">Days counted</TableCell>
            <TableCell align="right">Balanced</TableCell>
            <TableCell align="right">Short</TableCell>
            <TableCell align="right">Over</TableCell>
            <TableCell align="right">Net</TableCell>
            <TableCell>Worst day</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(report?.rows ?? []).map((row) => (
            <TableRow key={row.accountId} hover>
              <TableCell>
                <Typography variant="body2">{row.accountName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {row.branchName ?? 'Company'}
                </Typography>
              </TableCell>
              <TableCell align="right">{row.daysCounted}</TableCell>
              <TableCell align="right">
                <Chip
                  size="small"
                  variant="outlined"
                  color={row.daysBalanced === row.daysCounted ? 'success' : 'default'}
                  label={row.daysBalanced}
                />
              </TableCell>
              <TableCell align="right">
                {row.daysShort > 0 ? (
                  <Typography variant="body2" color="error.main">
                    {row.daysShort} · {money(row.totalShort)}
                  </Typography>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell align="right">
                {row.daysOver > 0 ? (
                  <Typography variant="body2" color="warning.main">
                    {row.daysOver} · {money(row.totalOver)}
                  </Typography>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell align="right">
                <Typography
                  variant="body2"
                  fontWeight={600}
                  color={
                    Math.abs(row.netVariance) <= 1
                      ? 'success.main'
                      : row.netVariance < 0
                        ? 'error.main'
                        : 'warning.main'
                  }
                >
                  {money(row.netVariance)}
                </Typography>
              </TableCell>
              <TableCell>
                {row.worstDate ? (
                  <>
                    <Typography variant="body2">{day(row.worstDate)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {money(row.worstVariance)}
                    </Typography>
                  </>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          ))}

          {report && report.rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  No days were closed between these dates.
                </Typography>
              </TableCell>
            </TableRow>
          )}

          {report && report.rows.length > 1 && (
            <TableRow>
              <TableCell colSpan={5} align="right">
                <Typography variant="body2" fontWeight={600}>
                  Across every account
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700}>
                  {money(report.netVariance)}
                </Typography>
              </TableCell>
              <TableCell />
            </TableRow>
          )}
        </TableBody>
      </Table>

      {report && report.rows.some((row) => row.daysShort >= 3) && (
        <Alert severity="warning" sx={{ m: 2 }}>
          A till that comes up short repeatedly is worth looking at as a pattern rather than
          as a run of separate mistakes. Reopened closes are left out of these figures — they
          were replaced by a fresh count.
        </Alert>
      )}
    </Paper>
  );
}
