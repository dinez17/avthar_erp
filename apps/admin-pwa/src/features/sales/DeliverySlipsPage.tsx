import PrintIcon from '@mui/icons-material/Print';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import { Button, IconButton, MenuItem, Stack, TextField, Tooltip } from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toDateInput } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import { DataTable } from '../../components/DataTable';
import { type DeliverySlipListItem, useDeliverySlips } from './invoices-api';
import { useBranches } from '../products/branch-prices-api';
import { useAuth } from '../../auth/AuthProvider';
import { useSessionBranchId } from '../../lib/session-branch';

/** Restricted dispatch view: enough context to choose a posted delivery slip, and no billing data. */
export function DeliverySlipsPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const branches = useBranches();
  const { user } = useAuth();
  const canChangeBranch = Boolean(user?.roles.some((role) =>
    role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'GODOWN STAFF',
  ));
  const availableBranches = (branches.data ?? []).filter((branch) =>
    canChangeBranch || user?.branchIds.includes(branch.id),
  );
  const today = toDateInput(new Date());
  const [branchId, setBranchId] = useSessionBranchId();
  const [draftFilters, setDraftFilters] = useState({ fromDate: today, toDate: today, branchId });
  const [filters, setFilters] = useState(draftFilters);

  useEffect(() => {
    if (!canChangeBranch && user?.branchIds.length) {
      const allowedBranch = user.branchIds.includes(branchId) ? branchId : user.branchIds[0]!;
      setBranchId(allowedBranch);
      setDraftFilters((current) => ({ ...current, branchId: allowedBranch }));
      setFilters((current) => ({ ...current, branchId: allowedBranch }));
    }
  }, [branchId, canChangeBranch, setBranchId, user?.branchIds]);

  const { data, isFetching } = useDeliverySlips(pagination.query, filters);

  const columns = useMemo<ColDef<DeliverySlipListItem>[]>(() => [
    { field: 'invoiceNumber', headerName: 'Invoice no', minWidth: 170 },
    {
      field: 'invoiceDate',
      headerName: 'Date',
      minWidth: 120,
      valueFormatter: (params) => params.value
        ? new Date(params.value as string).toLocaleDateString('en-IN')
        : '',
    },
    { field: 'customerName', headerName: 'Customer', minWidth: 220 },
    { field: 'customerMobile', headerName: 'Phone', minWidth: 140 },
    { field: 'branchName', headerName: 'Branch', minWidth: 200 },
    { field: 'copyType', headerName: 'Copy', minWidth: 110, valueFormatter: (params) => params.value === 'ORIGINAL' ? 'Original' : 'Godown' },
    { field: 'godownName', headerName: 'Godown', minWidth: 180, valueFormatter: (params) => params.value ?? 'All godowns' },
    { field: 'salesmanName', headerName: 'Salesman', minWidth: 150 },
    { field: 'itemCount', headerName: 'Items', maxWidth: 90 },
    { field: 'totalBoxes', headerName: 'Boxes', maxWidth: 90 },
    { field: 'totalPieces', headerName: 'Pcs', maxWidth: 90 },
    {
      headerName: 'Godown slip',
      maxWidth: 130,
      cellRenderer: (params: ICellRendererParams<DeliverySlipListItem>) => {
        if (!params.data || params.data.printed) return null;
        return (
          <Tooltip title="View and print godown slip">
            <IconButton
              size="small"
              color="primary"
              onClick={() => navigate(
                `/sales-invoices/${params.data!.invoiceId}/print?document=delivery&paper=80mm${params.data!.godownId ? `&godownId=${params.data!.godownId}` : ''}`,
              )}
            >
              <PrintIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      },
    },
  ], [navigate]);

  return (
    <PageContainer
      title={user?.roles.includes('GODOWN STAFF') ? 'Godown slips' : 'Delivery slips'}
      subtitle={user?.roles.includes('GODOWN STAFF')
        ? 'Assigned godown slips are limited to one print per invoice and godown.'
        : 'Original delivery slips are limited to one print per invoice.'}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <TextField
          label="From date"
          type="date"
          size="small"
          value={draftFilters.fromDate}
          onChange={(event) => setDraftFilters((current) => ({ ...current, fromDate: event.target.value }))}
          InputLabelProps={{ shrink: true }}
          inputProps={{ max: draftFilters.toDate || undefined }}
          sx={{ width: { xs: '100%', sm: 165 } }}
        />
        <TextField
          label="To date"
          type="date"
          size="small"
          value={draftFilters.toDate}
          onChange={(event) => setDraftFilters((current) => ({ ...current, toDate: event.target.value }))}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: draftFilters.fromDate || undefined }}
          sx={{ width: { xs: '100%', sm: 165 } }}
        />
        <TextField
          select
          label="Branch"
          size="small"
          value={draftFilters.branchId}
          disabled={!canChangeBranch && availableBranches.length === 0}
          onChange={(event) => setDraftFilters((current) => ({ ...current, branchId: event.target.value }))}
          sx={{ width: { xs: '100%', sm: 220 } }}
        >
          {canChangeBranch && <MenuItem value="">All branches</MenuItem>}
          {availableBranches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          startIcon={<FilterAltIcon />}
          onClick={() => {
            setBranchId(draftFilters.branchId);
            setFilters(draftFilters);
            pagination.setPage(1);
          }}
        >
          Filter
        </Button>
      </Stack>
      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        meta={data?.meta}
        pagination={pagination}
        loading={isFetching}
        searchPlaceholder="Search invoice number or customer…"
        exportable={false}
      />
    </PageContainer>
  );
}
