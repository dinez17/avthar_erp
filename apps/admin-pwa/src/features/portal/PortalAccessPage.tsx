import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { PortalAccountItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import {
  useCreatePortalAccount,
  useDeletePortalAccount,
  usePortalAccounts,
  useSetPortalAccountActive,
  useSupplierOptions,
} from './api';

/** Admin provisioning of supplier portal logins. */
export function PortalAccessPage(): JSX.Element {
  const pagination = usePagination();
  const { data, isFetching } = usePortalAccounts(pagination.query);
  const suppliers = useSupplierOptions();
  const createAccount = useCreatePortalAccount();
  const setActive = useSetPortalAccountActive();
  const deleteAccount = useDeletePortalAccount();

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [deleting, setDeleting] = useState<PortalAccountItem | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!supplierId) return setError('Choose a supplier');
    if (!email.trim()) return setError('Enter the login email');
    if (fullName.trim().length < 2) return setError('Enter the contact name');
    try {
      const result = await createAccount.mutateAsync({
        partyType: 'SUPPLIER',
        supplierId,
        email: email.trim(),
        fullName: fullName.trim(),
      });
      setOpen(false);
      setSupplierId('');
      setEmail('');
      setFullName('');
      if (result.temporaryPassword) {
        setTempPassword(result.temporaryPassword);
        setNotice(null);
      } else {
        setNotice(`Portal access granted to ${result.account.email}.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const columns = useMemo<ColDef<PortalAccountItem>[]>(
    () => [
      { field: 'partyName', headerName: 'Supplier', minWidth: 190, valueFormatter: (p) => p.value ?? '—' },
      { field: 'fullName', headerName: 'Contact', minWidth: 160 },
      { field: 'email', headerName: 'Login email', minWidth: 210 },
      {
        field: 'isActive',
        headerName: 'Active',
        minWidth: 150,
        cellRenderer: (p: ICellRendererParams<PortalAccountItem>) => {
          const account = p.data;
          if (!account) return null;
          return (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Switch
                size="small"
                checked={account.isActive}
                onChange={(e) =>
                  setActive
                    .mutateAsync({ id: account.id, isActive: e.target.checked })
                    .then(() =>
                      setNotice(
                        `${account.email} ${e.target.checked ? 'enabled' : 'disabled'}.`,
                      ),
                    )
                    .catch(() => setError('Could not update the login'))
                }
              />
              <Chip
                label={account.isActive ? 'Active' : 'Disabled'}
                size="small"
                color={account.isActive ? 'success' : 'default'}
              />
            </Stack>
          );
        },
      },
      {
        headerName: '',
        maxWidth: 80,
        cellRenderer: (p: ICellRendererParams<PortalAccountItem>) =>
          p.data ? (
            <Tooltip title="Revoke access">
              <IconButton size="small" color="error" onClick={() => setDeleting(p.data!)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null,
      },
    ],
    [setActive],
  );

  return (
    <PageContainer
      title="Portal access"
      subtitle="Grant a supplier a login to their own portal, and revoke it when needed."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Grant access
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

        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by email…"
          height={560}
        />
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Grant supplier portal access</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField
              select
              label="Supplier *"
              size="small"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {(suppliers.data ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Contact name *"
              size="small"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <TextField
              label="Login email *"
              size="small"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helperText="An existing user with this email is linked; otherwise a new login is created"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void submit()} disabled={createAccount.isPending}>
            {createAccount.isPending ? 'Granting…' : 'Grant access'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={tempPassword !== null} onClose={() => setTempPassword(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Temporary password</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Share this once with the supplier — it is not shown again. They should change it
              after signing in.
            </Typography>
            <Typography variant="h6" sx={{ fontFamily: 'monospace', letterSpacing: 1 }}>
              {tempPassword}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setTempPassword(null)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Revoke portal access"
        message={`Revoke ${deleting?.email}'s access to ${deleting?.partyName ?? 'this supplier'}?`}
        confirmLabel="Revoke"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const account = deleting;
          setDeleting(null);
          if (!account) return;
          deleteAccount
            .mutateAsync(account.id)
            .then(() => setNotice(`Access revoked for ${account.email}.`))
            .catch(() => setError('Could not revoke access'));
        }}
      />
    </PageContainer>
  );
}
