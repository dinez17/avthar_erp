import DownloadIcon from '@mui/icons-material/Download';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import type { CashEntryItem, OwnerStatement } from '@tiles-erp/shared-types';
import { useOwnerStatement, useOwnerSummary } from './api';

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

const monthStart = (): string => {
  const now = new Date();
  return localDay(new Date(now.getFullYear(), now.getMonth(), 1));
};

const csvOf = (statement: OwnerStatement): string => {
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const header = ['Date', 'Number', 'Details', 'In', 'Out', 'Balance'];
  const rows = statement.entries.map((entry: CashEntryItem) => [
    day(entry.entryDate),
    entry.entryNumber,
    entry.counterAccountName ?? entry.narration ?? entry.type,
    entry.direction === 'IN' ? entry.amount.toFixed(2) : '',
    entry.direction === 'OUT' ? entry.amount.toFixed(2) : '',
    entry.balance.toFixed(2),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => escape(String(cell))).join(','))
    .join('\n');
};

/**
 * What each owner took, what they passed on, and what they are still holding.
 *
 * The money handed over at day close does not leave the company — it moves to a person.
 * With several owners taking cash on different nights, "who has what" is the question this
 * page exists to answer, and it is the one an owner will want to see before signing.
 */
export function OwnerStatementPage(): JSX.Element {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDay(new Date()));
  const [ownerId, setOwnerId] = useState('');
  const [showReversed, setShowReversed] = useState(false);

  const { data: summary } = useOwnerSummary(from, to);
  const { data: statement } = useOwnerStatement(ownerId, from, to, showReversed);

  useEffect(() => {
    if (!ownerId && summary?.rows.length) setOwnerId(summary.rows[0]!.accountId);
  }, [summary, ownerId]);

  const download = (): void => {
    if (!statement) return;
    const blob = new Blob([csvOf(statement)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${statement.accountName.replace(/\s+/g, '-')}-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer
      title="Owner statement"
      subtitle="Cash taken at day close: where it came from, where it went, what is left"
      actions={
        <Button
          startIcon={<DownloadIcon />}
          disabled={!statement?.entries.length}
          onClick={download}
        >
          CSV
        </Button>
      }
    >
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
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showReversed}
                onChange={(event) => setShowReversed(event.target.checked)}
              />
            }
            label="Show reversed"
          />
        </Stack>
        {!showReversed && (statement?.reversedHidden ?? 0) > 0 && (
          <Typography variant="caption" color="text.secondary">
            {statement!.reversedHidden} cancelled row
            {statement!.reversedHidden === 1 ? '' : 's'} hidden. A reversal and the entry it
            cancelled net to nothing, so the figures show what was actually taken.
          </Typography>
        )}
      </Paper>

      {summary && summary.rows.length === 0 && (
        <Alert severity="info">
          No owners are set up yet. Add them on <strong>Cash &amp; bank</strong> as accounts of
          type <strong>Owner</strong>, and the day's takings can be handed to one of them at
          close.
        </Alert>
      )}

      {summary && summary.rows.length > 0 && (
        <Paper variant="outlined" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
            Who is holding what
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Owner</TableCell>
                <TableCell align="right">Opening</TableCell>
                <TableCell align="right">Taken</TableCell>
                <TableCell align="right">Paid out</TableCell>
                <TableCell align="right">Holding now</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.rows.map((row) => (
                <TableRow
                  key={row.accountId}
                  hover
                  selected={row.accountId === ownerId}
                  onClick={() => setOwnerId(row.accountId)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell align="right">{money(row.openingBalance)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="success.main">
                      {money(row.taken)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="error.main">
                      {money(row.paidOut)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600}>
                      {money(row.closingBalance)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Held between them
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700}>
                    {money(summary.totalHeld)}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Paper>
      )}

      {statement && (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <Figure label="Opening" value={statement.openingBalance} />
            <Figure label="Taken" value={statement.taken} tone="success.main" />
            <Figure label="Banked" value={statement.banked} />
            <Figure label="Other payments" value={statement.otherOut} tone="warning.main" />
            <Figure label="Holding now" value={statement.closingBalance} strong />
          </Stack>

          {statement.takenFrom.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Where {statement.accountName}&apos;s cash came from
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <Table size="small">
                <TableBody>
                  {statement.takenFrom.map((source) => (
                    <TableRow key={source.accountId}>
                      <TableCell>{source.accountName}</TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {source.branchName ?? 'Company'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${source.handovers} handover${source.handovers === 1 ? '' : 's'}`}
                        />
                      </TableCell>
                      <TableCell align="right">{money(source.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Paper variant="outlined">
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>
              {statement.accountName} — every movement
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Number</TableCell>
                  <TableCell>Details</TableCell>
                  <TableCell align="right">In</TableCell>
                  <TableCell align="right">Out</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      Opening balance
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{money(statement.openingBalance)}</TableCell>
                </TableRow>

                {statement.entries.map((entry) => (
                  <TableRow key={entry.id} hover sx={entry.reversedAt ? { opacity: 0.55 } : {}}>
                    <TableCell>{day(entry.entryDate)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace">
                        {entry.entryNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {entry.counterAccountName ?? entry.narration ?? entry.type}
                      </Typography>
                      {entry.counterAccountName && entry.narration && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {entry.narration}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {entry.direction === 'IN' ? (
                        <Typography variant="body2" color="success.main">
                          {money(entry.amount)}
                        </Typography>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {entry.direction === 'OUT' ? (
                        <Typography variant="body2" color="error.main">
                          {money(entry.amount)}
                        </Typography>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="right">{money(entry.balance)}</TableCell>
                  </TableRow>
                ))}

                {statement.entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        Nothing moved for {statement.accountName} between these dates.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}

                <TableRow>
                  <TableCell colSpan={5} align="right">
                    <Typography variant="body2" fontWeight={600}>
                      Holding now
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700}>
                      {money(statement.closingBalance)}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>

          {statement.otherOut > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {money(statement.otherOut)} left this holding without reaching a bank account.
              That is the part worth being able to explain — a supplier paid in cash, an
              expense met personally.
            </Alert>
          )}
        </>
      )}
    </PageContainer>
  );
}

function Figure({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: number;
  tone?: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box>
        <Typography variant="h6" color={tone} fontWeight={strong ? 700 : 500}>
          {money(value)}
        </Typography>
      </Box>
    </Paper>
  );
}
