import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SavingsIcon from '@mui/icons-material/Savings';
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
  MenuItem,
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
import type { LedgerAccountItem, LedgerAccountType } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import {
  useDeleteLedgerAccount,
  useLedgerAccounts,
  useSaveLedgerAccount,
} from './api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = (): string => new Date().toISOString().slice(0, 10);

interface Draft {
  id?: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  branchId: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  openingBalance: string;
  retainedFloat: string;
  openingDate: string;
  isActive: boolean;
  notes: string;
}

const blank = (): Draft => ({
  code: '',
  name: '',
  type: 'BANK',
  branchId: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  openingBalance: '',
  retainedFloat: '',
  openingDate: today(),
  isActive: true,
  notes: '',
});

const draftOf = (account: LedgerAccountItem): Draft => ({
  id: account.id,
  code: account.code,
  name: account.name,
  type: account.type,
  branchId: account.branchId ?? '',
  bankName: account.bankName ?? '',
  accountNumber: account.accountNumber ?? '',
  ifsc: account.ifsc ?? '',
  openingBalance: String(account.openingBalance),
  retainedFloat: account.retainedFloat ? String(account.retainedFloat) : '',
  openingDate: account.openingDate.slice(0, 10),
  isActive: account.isActive,
  notes: account.notes ?? '',
});

/**
 * Cash boxes and bank accounts.
 *
 * A branch holds as many as it needs — the counter drawer, and a row per bank it deals
 * with. Grouped by branch because that is how someone thinks about it: "what does Head
 * Office have", not "list every bank account we own".
 */
export function AccountsPage(): JSX.Element {
  const branches = useBranches();
  const [includeInactive, setIncludeInactive] = useState(false);
  const accounts = useLedgerAccounts({ includeInactive });
  const save = useSaveLedgerAccount();
  const remove = useDeleteLedgerAccount();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Grouped by branch, with company-level accounts last. */
  const groups = useMemo(() => {
    const rows = accounts.data ?? [];
    const byBranch = new Map<string, { name: string; rows: LedgerAccountItem[] }>();
    for (const row of rows) {
      const key = row.branchId ?? '';
      const group = byBranch.get(key) ?? {
        name: row.branchName ?? 'Company-wide',
        rows: [],
      };
      group.rows.push(row);
      byBranch.set(key, group);
    }
    return [...byBranch.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0));
  }, [accounts.data]);

  const set = (patch: Partial<Draft>): void =>
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));

  const submit = async (): Promise<void> => {
    if (!draft) return;
    setError(null);
    try {
      await save.mutateAsync({
        id: draft.id,
        code: draft.code.trim() || undefined,
        name: draft.name,
        type: draft.type,
        branchId: draft.branchId || null,
        bankName: draft.bankName.trim() || undefined,
        accountNumber: draft.accountNumber.trim() || undefined,
        ifsc: draft.ifsc.trim() || undefined,
        openingBalance: draft.openingBalance === '' ? 0 : Number(draft.openingBalance),
        retainedFloat:
          draft.type === 'CASH' && draft.retainedFloat !== ''
            ? Number(draft.retainedFloat)
            : 0,
        openingDate: new Date(draft.openingDate).toISOString(),
        isActive: draft.isActive,
        notes: draft.notes.trim() || undefined,
      });
      setNotice(`${draft.name} saved.`);
      setDraft(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That could not be saved');
    }
  };

  const isBank = draft?.type === 'BANK';

  return (
    <PageContainer
      title="Cash & bank accounts"
      subtitle="Every drawer and bank account, and what each holds right now."
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Show closed</Typography>}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDraft(blank())}>
            New account
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        {groups.length === 0 && (
          <Alert severity="info">
            No accounts yet. Add the branch&rsquo;s cash drawer first, then a row for each bank
            it deals with.
          </Alert>
        )}

        {groups.map(([branchId, group]) => {
          const total = group.rows.reduce((sum, row) => sum + row.currentBalance, 0);
          return (
            <Paper key={branchId || 'company'} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2">{group.name}</Typography>
                <Typography variant="body2" fontWeight={700}>
                  ₹{money(total)}
                </Typography>
              </Stack>
              <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 44 }} />
                    <TableCell>Account</TableCell>
                    <TableCell>Code</TableCell>
                    <TableCell>Bank details</TableCell>
                    <TableCell align="right">Opening</TableCell>
                    <TableCell align="right">Balance now</TableCell>
                    <TableCell align="right" sx={{ width: 90 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.rows.map((account) => (
                    <TableRow key={account.id} hover>
                      <TableCell>
                        <Tooltip
                          title={
                            account.type === 'CASH'
                              ? 'Cash drawer'
                              : account.type === 'OWNER'
                                ? 'Cash held by an owner'
                                : 'Bank account'
                          }
                        >
                          {account.type === 'CASH' ? (
                            <SavingsIcon fontSize="small" color="action" />
                          ) : (
                            <AccountBalanceIcon fontSize="small" color="action" />
                          )}
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {account.name}
                        {!account.isActive && (
                          <Chip label="closed" size="small" variant="outlined" sx={{ ml: 0.5 }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontFamily="monospace">
                          {account.code}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {[account.bankName, account.accountNumber, account.ifsc]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{money(account.openingBalance)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={account.currentBalance < 0 ? 'error.main' : undefined}
                        >
                          {money(account.currentBalance)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => setDraft(draftOf(account))}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() =>
                            void remove
                              .mutateAsync(account.id)
                              .then(() => setNotice(`${account.name} deleted.`))
                              .catch((err: unknown) =>
                                setError(
                                  err instanceof ApiError ? err.message : 'That could not be deleted',
                                ),
                              )
                          }
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          );
        })}

        {error && !draft && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary">
          A balance is the opening plus every entry since — counted, never stored. An account
          that has entries cannot be deleted or have its opening balance moved; close it
          instead, or post an adjusting entry.
        </Typography>
      </Stack>

      <Dialog open={draft !== null} onClose={() => setDraft(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{draft?.id ? 'Edit account' : 'New account'}</DialogTitle>
        <DialogContent>
          {draft && (
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              {error && <Alert severity="error">{error}</Alert>}

              <Stack direction="row" spacing={1}>
                <TextField
                  select
                  label="Type"
                  size="small"
                  value={draft.type}
                  onChange={(e) => set({ type: e.target.value as LedgerAccountType })}
                  sx={{ width: 160 }}
                >
                  <MenuItem value="CASH">Cash drawer</MenuItem>
                  <MenuItem value="BANK">Bank account</MenuItem>
                  <MenuItem value="OWNER">Owner</MenuItem>
                </TextField>
                <TextField
                  select
                  label={draft.type === 'CASH' ? 'Branch *' : 'Branch'}
                  size="small"
                  value={draft.branchId}
                  onChange={(e) => set({ branchId: e.target.value })}
                  sx={{ flex: 1 }}
                  disabled={draft.type === 'OWNER'}
                  helperText={
                    draft.type === 'CASH'
                      ? 'A drawer belongs to a branch'
                      : draft.type === 'OWNER'
                        ? 'An owner holds money for the company, not one branch'
                        : 'Leave blank for a company-level account'
                  }
                >
                  <MenuItem value="">Company-wide</MenuItem>
                  {(branches.data ?? []).map((branch) => (
                    <MenuItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <TextField
                label="Name *"
                size="small"
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={
                  draft.type === 'CASH'
                    ? 'Counter drawer'
                    : draft.type === 'OWNER'
                      ? 'Rajesh Patel'
                      : 'Axis Bank — 5521'
                }
                autoFocus
              />

              {isBank && (
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Bank *"
                    size="small"
                    value={draft.bankName}
                    onChange={(e) => set({ bankName: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="A/c number"
                    size="small"
                    value={draft.accountNumber}
                    onChange={(e) => set({ accountNumber: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="IFSC"
                    size="small"
                    value={draft.ifsc}
                    onChange={(e) => set({ ifsc: e.target.value })}
                    sx={{ width: 150 }}
                  />
                </Stack>
              )}

              <Stack direction="row" spacing={1}>
                <TextField
                  label="Code"
                  size="small"
                  value={draft.code}
                  onChange={(e) => set({ code: e.target.value })}
                  helperText="Generated from the branch if left blank"
                  sx={{ width: 180 }}
                />
                <TextField
                  label="Opening balance"
                  type="number"
                  size="small"
                  value={draft.openingBalance}
                  onChange={(e) => set({ openingBalance: e.target.value })}
                  sx={{ width: 170 }}
                />
                <TextField
                  label="As on"
                  type="date"
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={draft.openingDate}
                  onChange={(e) => set({ openingDate: e.target.value })}
                  sx={{ width: 170 }}
                />
              </Stack>

              {draft.type === 'CASH' && (
                <TextField
                  label="Keep back at day close"
                  type="number"
                  size="small"
                  value={draft.retainedFloat}
                  onChange={(e) => set({ retainedFloat: e.target.value })}
                  helperText="The float this drawer opens with tomorrow. Everything above it is offered to an owner at close."
                  sx={{ width: 300 }}
                />
              )}

              <TextField
                label="Notes"
                size="small"
                value={draft.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={draft.isActive}
                    onChange={(e) => set({ isActive: e.target.checked })}
                  />
                }
                label="Open — money can be posted to it"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!draft?.name.trim() || save.isPending}
            onClick={() => void submit()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
