import DeleteIcon from '@mui/icons-material/Delete';
import PaymentsIcon from '@mui/icons-material/Payments';
import {
  Alert,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { DriverCashHandoverItem, DriverDueSummary } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { HandoverDialog } from './HandoverDialog';
import { useDeleteHandover, useHandovers, useOutstandingDrivers } from './driver-cash-api';

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Freight cash moving from the driver's pocket to the counter.
 *
 * The top half is who is carrying what — the counter's worklist — and the bottom half is
 * what has already come in. They are separate because a driver's balance is a live
 * question and a handover is a closed one.
 */
export function DriverCashPage(): JSX.Element {
  const branches = useBranches();
  const pagination = usePagination();
  const [branchId, setBranchId] = useState('');
  const [taking, setTaking] = useState<DriverDueSummary | null>(null);
  const [deleting, setDeleting] = useState<DriverCashHandoverItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const outstanding = useOutstandingDrivers(branchId || undefined);
  const handovers = useHandovers(pagination.query, branchId || undefined);
  const deleteHandover = useDeleteHandover();

  const carrying = outstanding.data ?? [];
  const totalCarried =
    Math.round(carrying.reduce((sum, driver) => sum + driver.balance, 0) * 100) / 100;

  return (
    <PageContainer
      title="Driver cash"
      subtitle="Freight collected on the road, and the money that has reached the counter."
      actions={
        <TextField
          select
          label="Branch"
          size="small"
          fullWidth={false}
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          sx={{ width: 180 }}
        >
          <MenuItem value="">All branches</MenuItem>
          {(branches.data ?? []).map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.name}
            </MenuItem>
          ))}
        </TextField>
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

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="subtitle2">With the drivers</Typography>
            {totalCarried > 0 && (
              <Typography variant="subtitle2" color="warning.main">
                {money(totalCarried)} out on the road
              </Typography>
            )}
          </Stack>

          <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Driver</TableCell>
                <TableCell align="right">Trips unsettled</TableCell>
                <TableCell align="right">Carrying</TableCell>
                <TableCell align="right" sx={{ width: 150 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {carrying.map((driver) => (
                <TableRow key={driver.driverId ?? driver.driverName} hover>
                  <TableCell>{driver.driverName}</TableCell>
                  <TableCell align="right">{driver.trips.length}</TableCell>
                  <TableCell align="right">
                    <Chip label={money(driver.balance)} size="small" color="warning" />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PaymentsIcon />}
                      onClick={() => setTaking(driver)}
                    >
                      Take cash
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {carrying.length === 0 && !outstanding.isLoading && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">
                      No driver is holding freight cash. Everything collected has reached the
                      counter.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" gutterBottom>
            Handed in
          </Typography>
          <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Receipt</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Driver</TableCell>
                <TableCell>Branch</TableCell>
                <TableCell align="right">Trips</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Taken by</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {(handovers.data?.items ?? []).map((handover) => (
                <TableRow key={handover.id} hover>
                  <TableCell>{handover.handoverNo}</TableCell>
                  <TableCell>
                    {new Date(handover.handoverDate).toLocaleDateString('en-IN')}
                  </TableCell>
                  <TableCell>{handover.driverName}</TableCell>
                  <TableCell>{handover.branchName}</TableCell>
                  <TableCell align="right">{handover.tripCount}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {money(handover.amount)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {/* Older rows carry no name, so a bare "—" would read as a gap. */}
                      {[handover.receivedByName, handover.remarks].filter(Boolean).join(' · ') ||
                        '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Reverse: the trips owe the money again">
                      <IconButton size="small" color="error" onClick={() => setDeleting(handover)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {(handovers.data?.items ?? []).length === 0 && !handovers.isLoading && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary">
                      No cash has been handed in yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </Stack>

      <HandoverDialog
        driver={taking}
        branchId={branchId}
        onClose={() => setTaking(null)}
        onSaved={(handoverNo, amount) => {
          setTaking(null);
          setNotice(`${handoverNo}: ${money(amount)} taken in.`);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Reverse this handover"
        message={`Reverse ${deleting?.handoverNo}? The ${money(deleting?.amount ?? 0)} goes back to ${deleting?.driverName}'s balance.`}
        confirmLabel="Reverse"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const handover = deleting;
          setDeleting(null);
          if (!handover) return;
          void (async () => {
            setError(null);
            try {
              await deleteHandover.mutateAsync(handover.id);
              setNotice(`${handover.handoverNo} reversed.`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Something went wrong');
            }
          })();
        }}
      />
    </PageContainer>
  );
}
