import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import type { CashEntryItem, ExpenseHeadItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import {
  downloadTableExcel,
  downloadTablePdf,
  type ExportColumn,
} from '../../components/ListExportButtons';
import { useDeleteExpenseHead, useExpenseHeadLedger, useExpenseHeads, useSaveExpenseHead } from './api';
import { AccountBranchSelect, useAccountBranch } from './AccountBranchSelect';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const localDay = (): string => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const ledgerColumns: ExportColumn<CashEntryItem>[] = [
  { header: 'Date', value: (entry) => new Date(entry.entryDate).toLocaleDateString('en-IN'), width: 80 },
  { header: 'Number', value: (entry) => entry.entryNumber, width: 115 },
  { header: 'Account', value: (entry) => entry.accountName, width: 140 },
  { header: 'Branch', value: (entry) => entry.branchName, width: 140 },
  { header: 'Details', value: (entry) => entry.narration ?? entry.referenceNo ?? entry.refNumber ?? '', width: 190 },
  { header: 'Amount', value: (entry) => entry.direction === 'IN' ? -entry.amount : entry.amount, width: 90 },
  { header: 'Balance', value: (entry) => entry.balance, width: 90 },
];

interface Draft {
  id?: string;
  code: string;
  name: string;
  isActive: boolean;
  notes: string;
}

const blank = (): Draft => ({ code: '', name: '', isActive: true, notes: '' });

const draftOf = (head: ExpenseHeadItem): Draft => ({
  id: head.id,
  code: head.code,
  name: head.name,
  isActive: head.isActive,
  notes: head.notes ?? '',
});

/**
 * What money is spent on: rent, freight, tea, repairs.
 *
 * A head is the only thing that makes an expense answerable later — "5,000 out of the
 * drawer" tells you nothing next March, and a free-text note cannot be added up.
 */
export function ExpenseHeadsPage(): JSX.Element {
  const branch = useAccountBranch();
  const [showRetired, setShowRetired] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ledgerHead, setLedgerHead] = useState<ExpenseHeadItem | null>(null);
  const [ledgerFrom, setLedgerFrom] = useState(localDay());
  const [ledgerTo, setLedgerTo] = useState(localDay());
  const [error, setError] = useState<string | null>(null);

  const { data: heads = [], isLoading } = useExpenseHeads(showRetired, branch.branchId);
  const save = useSaveExpenseHead();
  const remove = useDeleteExpenseHead();
  const ledger = useExpenseHeadLedger(ledgerHead?.id ?? null, ledgerFrom, ledgerTo, branch.branchId);

  const exportLedger = (format: 'excel' | 'pdf'): void => {
    if (!ledgerHead || !ledger.data?.entries.length) return;
    const safeName = ledgerHead.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    const title = `${ledgerHead.name} Expense Ledger (${ledgerFrom} to ${ledgerTo}) - Net ${money(ledger.data.total)}`;
    const filename = `expense-ledger-${safeName}-${ledgerFrom}-to-${ledgerTo}`;
    if (format === 'excel') {
      downloadTableExcel(`${filename}.xls`, title, ledgerColumns, ledger.data.entries);
    } else {
      downloadTablePdf(`${filename}.pdf`, title, ledgerColumns, ledger.data.entries);
    }
  };

  const totalSpent = useMemo(
    () => heads.reduce((sum, head) => sum + head.spentThisYear, 0),
    [heads],
  );

  const submit = async (): Promise<void> => {
    if (!draft) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: draft.id,
        code: draft.code.trim() || undefined,
        name: draft.name.trim(),
        isActive: draft.isActive,
        notes: draft.notes.trim() || undefined,
      });
      setDraft(null);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save that head');
    }
  };

  const drop = async (head: ExpenseHeadItem): Promise<void> => {
    setError(null);
    try {
      await remove.mutateAsync(head.id);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not delete that head');
    }
  };

  return (
    <PageContainer
      title="Expense heads"
      subtitle="What money is spent on, and what each has cost this financial year"
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showRetired}
                onChange={(event) => setShowRetired(event.target.checked)}
              />
            }
            label="Show retired"
          />
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setDraft(blank())}>
            Add head
          </Button>
        </Stack>
      }
    >
      <Stack sx={{ mb: 2 }}><AccountBranchSelect {...branch} /></Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 760, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 150 }}>Code</TableCell>
              <TableCell sx={{ width: '32%' }}>Head</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell align="right" sx={{ width: 165 }}>Spent this year</TableCell>
              <TableCell align="center" sx={{ width: 132 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {heads.map((head) => (
              <TableRow key={head.id} hover sx={{ '& > td': { py: 1.25 } }}>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {head.code}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">{head.name}</Typography>
                    {!head.isActive && <Chip size="small" label="Retired" />}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {head.notes ?? '—'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={head.spentThisYear ? 600 : 400}>
                    {money(head.spentThisYear)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Stack direction="row" spacing={0.25} justifyContent="center" flexWrap="nowrap">
                    <Tooltip title="Expense ledger">
                      <IconButton size="small" onClick={() => setLedgerHead(head)}>
                        <ReceiptLongIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => setDraft(draftOf(head))}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip
                      title={head.spentThisYear
                        ? 'Money has been booked here — retire it instead'
                        : 'Delete'}
                    >
                      <span>
                        <IconButton
                          size="small"
                          disabled={Boolean(head.spentThisYear)}
                          onClick={() => void drop(head)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {heads.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No expense heads yet. Add the handful you actually use — rent, freight,
                    fuel, repairs — rather than a long list nobody picks from.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {heads.length > 0 && (
              <TableRow>
                <TableCell colSpan={3} align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Total
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    {money(totalSpent)}
                  </Typography>
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={Boolean(ledgerHead)} onClose={() => setLedgerHead(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <span>{ledgerHead?.name} expense ledger</span>
            <Stack direction="row" spacing={1}>
              <Button
                size="small" variant="outlined" startIcon={<DownloadIcon />}
                disabled={!ledger.data?.entries.length} onClick={() => exportLedger('excel')}
              >Excel</Button>
              <Button
                size="small" variant="outlined" startIcon={<PictureAsPdfIcon />}
                disabled={!ledger.data?.entries.length} onClick={() => exportLedger('pdf')}
              >PDF</Button>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="From" type="date" size="small" value={ledgerFrom}
                onChange={(event) => setLedgerFrom(event.target.value)}
                InputLabelProps={{ shrink: true }} fullWidth
              />
              <TextField
                label="To" type="date" size="small" value={ledgerTo}
                onChange={(event) => setLedgerTo(event.target.value)}
                InputLabelProps={{ shrink: true }} fullWidth
              />
            </Stack>
            {ledger.isError && <Alert severity="error">Could not load the expense ledger.</Alert>}
            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 700 }}>
                <TableHead><TableRow>
                  <TableCell>Date</TableCell><TableCell>Number</TableCell>
                  <TableCell>Account</TableCell><TableCell>Branch</TableCell>
                  <TableCell>Details</TableCell><TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {(ledger.data?.entries ?? []).map((entry) => (
                    <TableRow key={entry.id} sx={{ opacity: entry.reversedAt ? 0.55 : 1 }}>
                      <TableCell>{new Date(entry.entryDate).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>{entry.entryNumber}</TableCell>
                      <TableCell>{entry.accountName}</TableCell>
                      <TableCell>{entry.branchName ?? '—'}</TableCell>
                      <TableCell>{entry.narration ?? entry.referenceNo ?? entry.refNumber ?? '—'}</TableCell>
                      <TableCell align="right">{entry.direction === 'IN' ? '-' : ''}{money(entry.amount)}</TableCell>
                      <TableCell align="right">{money(entry.balance)}</TableCell>
                    </TableRow>
                  ))}
                  {!ledger.isLoading && !(ledger.data?.entries.length) && (
                    <TableRow><TableCell colSpan={7}>No expenses in this period.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
            <Typography align="right" fontWeight={700}>
              Net expense: {money(ledger.data?.total ?? 0)}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setLedgerHead(null)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(draft)} onClose={() => setDraft(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{draft?.id ? 'Edit expense head' : 'Add expense head'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              size="small"
              autoFocus
              value={draft?.name ?? ''}
              onChange={(event) =>
                setDraft((previous) => previous && { ...previous, name: event.target.value })
              }
              placeholder="Shop rent"
            />
            <TextField
              label="Code"
              size="small"
              value={draft?.code ?? ''}
              onChange={(event) =>
                setDraft((previous) => previous && { ...previous, code: event.target.value })
              }
              helperText="Left blank, one is generated"
            />
            <TextField
              label="Notes"
              size="small"
              multiline
              minRows={2}
              value={draft?.notes ?? ''}
              onChange={(event) =>
                setDraft((previous) => previous && { ...previous, notes: event.target.value })
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={draft?.isActive ?? true}
                  onChange={(event) =>
                    setDraft(
                      (previous) => previous && { ...previous, isActive: event.target.checked },
                    )
                  }
                />
              }
              label="In use"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!draft?.name.trim() || save.isPending}
            onClick={() => void submit()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
