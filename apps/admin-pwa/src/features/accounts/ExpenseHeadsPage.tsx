import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
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
import type { ExpenseHeadItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useDeleteExpenseHead, useExpenseHeads, useSaveExpenseHead } from './api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [showRetired, setShowRetired] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: heads = [], isLoading } = useExpenseHeads(showRetired);
  const save = useSaveExpenseHead();
  const remove = useDeleteExpenseHead();

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
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Head</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell align="right">Spent this year</TableCell>
              <TableCell align="right" width={110}>
                &nbsp;
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {heads.map((head) => (
              <TableRow key={head.id} hover>
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
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => setDraft(draftOf(head))}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    title={
                      head.spentThisYear
                        ? 'Money has been booked here — retire it instead'
                        : 'Delete'
                    }
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
