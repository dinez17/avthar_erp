import { Alert, MenuItem, TextField } from '@mui/material';
import { useEffect, useMemo } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useBranches } from '../products/branch-prices-api';
import { useSessionBranchId } from '../../lib/session-branch';

export function useAccountBranch() {
  const { user } = useAuth();
  const branches = useBranches();
  const canAccessAll = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN'));
  const availableBranches = useMemo(
    () => (branches.data ?? []).filter((branch) => canAccessAll || user?.branchIds.includes(branch.id)),
    [branches.data, canAccessAll, user?.branchIds],
  );
  const [branchId, setBranchId] = useSessionBranchId();

  useEffect(() => {
    if (!availableBranches.length) return setBranchId('');
    setBranchId((current) => {
      if (availableBranches.some((branch) => branch.id === current)) return current;
      const mapped = user?.branchIds.find((id) => availableBranches.some((branch) => branch.id === id));
      return mapped ?? availableBranches[0]!.id;
    });
  }, [availableBranches, user?.branchIds]);

  return { branchId, setBranchId, availableBranches, loading: branches.isLoading };
}

export function AccountBranchSelect(props: ReturnType<typeof useAccountBranch>): JSX.Element {
  if (!props.loading && props.availableBranches.length === 0) {
    return <Alert severity="warning">No branch is assigned. Contact your administrator.</Alert>;
  }
  return (
    <TextField
      select
      size="small"
      label="Branch"
      value={props.branchId}
      onChange={(event) => props.setBranchId(event.target.value)}
      sx={{ minWidth: { xs: '100%', sm: 280 } }}
      disabled={props.loading || props.availableBranches.length <= 1}
    >
      {props.availableBranches.map((branch) => (
        <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>
      ))}
    </TextField>
  );
}
