import { Alert, MenuItem, Stack, TextField } from '@mui/material';
import type { ColDef } from 'ag-grid-community';
import { useEffect, useMemo } from 'react';
import { usePagination } from '@tiles-erp/hooks';
import { formatBoxPieces } from '@tiles-erp/shared';
import type { StockCheckItem } from '@tiles-erp/shared-types';
import { PageContainer } from '@tiles-erp/ui';
import { useAuth } from '../../auth/AuthProvider';
import { DataTable } from '../../components/DataTable';
import { useBranches } from '../products/branch-prices-api';
import { useStockCheck } from './api';
import { useSessionBranchId } from '../../lib/session-branch';

const quantity = (row: StockCheckItem, value: number): string =>
  formatBoxPieces(value, row.piecesPerBox, row.baseUom === 'PIECE');

/** One branch's usable and incoming stock position, by product. */
export function StockCheckPage(): JSX.Element {
  const pagination = usePagination({ initialPageSize: 50 });
  const { user } = useAuth();
  const branches = useBranches();
  const canChangeBranch = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN'));
  const availableBranches = (branches.data ?? []).filter(
    (branch) => canChangeBranch || user?.branchIds.includes(branch.id),
  );
  const [branchId, setBranchId] = useSessionBranchId();

  useEffect(() => {
    if (branchId && availableBranches.some((branch) => branch.id === branchId)) return;
    if (availableBranches.length === 1 || !canChangeBranch) setBranchId(availableBranches[0]?.id ?? '');
  }, [availableBranches, branchId, canChangeBranch]);

  const stock = useStockCheck(pagination.query, branchId, Boolean(branchId));
  const columns = useMemo<ColDef<StockCheckItem>[]>(() => [
    { field: 'sku', headerName: 'SKU', minWidth: 135 },
    { field: 'productName', headerName: 'Product', minWidth: 220, flex: 1 },
    { field: 'brandName', headerName: 'Brand', minWidth: 120 },
    { field: 'sizeMm', headerName: 'Size', minWidth: 95 },
    {
      field: 'currentQtyBoxes', headerName: 'Current stock', minWidth: 145,
      cellStyle: () => ({ fontWeight: 600 }), valueFormatter: (params) => params.data ? quantity(params.data, Number(params.value)) : '',
    },
    {
      field: 'poQtyBoxes', headerName: 'PO stock', minWidth: 135,
      valueFormatter: (params) => params.data ? quantity(params.data, Number(params.value)) : '',
    },
    {
      field: 'inTransitQtyBoxes', headerName: 'In-transit stock', minWidth: 145,
      valueFormatter: (params) => params.data ? quantity(params.data, Number(params.value)) : '',
    },
    {
      field: 'holdQtyBoxes', headerName: 'Hold stock', minWidth: 135,
      valueFormatter: (params) => params.data ? quantity(params.data, Number(params.value)) : '',
    },
    {
      field: 'availableQtyBoxes', headerName: 'Available stock', minWidth: 145,
      cellStyle: () => ({ fontWeight: 700, color: '#1e874b' }),
      valueFormatter: (params) => params.data ? quantity(params.data, Number(params.value)) : '',
    },
    {
      field: 'expectedQtyBoxes', headerName: 'Expected stock', minWidth: 145,
      valueFormatter: (params) => params.data ? quantity(params.data, Number(params.value)) : '',
    },
  ], []);

  return (
    <PageContainer
      title="Stock check"
      subtitle="Branch-wise on-hand, purchasing, transfer and reserved stock in one view."
    >
      <Stack spacing={1}>
        <TextField
          select
          label="Branch"
          size="small"
          value={branchId}
          onChange={(event) => { setBranchId(event.target.value); pagination.setPage(1); }}
          sx={{ width: { xs: '100%', sm: 260 } }}
          disabled={!canChangeBranch && availableBranches.length <= 1}
        >
          {availableBranches.map((branch) => <MenuItem key={branch.id} value={branch.id}>{branch.name}</MenuItem>)}
        </TextField>
        {!branchId ? (
          <Alert severity="info">No branch is assigned. Contact your administrator.</Alert>
        ) : (
          <DataTable
            rows={stock.data?.items ?? []}
            columns={columns}
            meta={stock.data?.meta}
            pagination={pagination}
            loading={stock.isFetching}
            searchPlaceholder="Search by product or SKU…"
            height={620}
          />
        )}
      </Stack>
    </PageContainer>
  );
}
