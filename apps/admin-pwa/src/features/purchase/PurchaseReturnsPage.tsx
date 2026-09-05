import AddIcon from '@mui/icons-material/Add';
import PublishIcon from '@mui/icons-material/Publish';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
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
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { formatBoxPieces } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer } from '@tiles-erp/ui';
import type { PurchaseReturnItem, PurchaseReturnStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { PurchaseReturnDialog } from './PurchaseReturnDialog';
import { useSuppliers } from './api';
import { usePostPurchaseReturn, usePurchaseReturn, usePurchaseReturns } from './returns-api';

const STATUS_COLORS: Record<PurchaseReturnStatus, 'default' | 'success'> = {
  DRAFT: 'default',
  POSTED: 'success',
};

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Purchase returns (debit notes). Posting removes the goods from stock. */
export function PurchaseReturnsPage(): JSX.Element {
  const pagination = usePagination();
  const suppliers = useSuppliers();
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');

  const { data, isFetching } = usePurchaseReturns(pagination.query, {
    supplierId: supplierId || undefined,
    branchId: branchId || undefined,
  });
  const postReturn = usePostPurchaseReturn();

  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [posting, setPosting] = useState<PurchaseReturnItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detail = usePurchaseReturn(viewingId);

  const columns = useMemo<ColDef<PurchaseReturnItem>[]>(
    () => [
      { field: 'returnNumber', headerName: 'Return no', minWidth: 160 },
      {
        field: 'returnDate',
        headerName: 'Date',
        minWidth: 120,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'supplierName', headerName: 'Supplier', minWidth: 180 },
      { field: 'godownName', headerName: 'From godown', minWidth: 140 },
      { field: 'reason', headerName: 'Reason', minWidth: 180 },
      { field: 'totalBoxes', headerName: 'Boxes', maxWidth: 100 },
      {
        field: 'grandTotal',
        headerName: 'Debit note',
        maxWidth: 140,
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'status',
        headerName: 'Status',
        maxWidth: 110,
        cellRenderer: (p: ICellRendererParams<PurchaseReturnItem>) => (
          <Chip
            label={p.value as string}
            size="small"
            color={STATUS_COLORS[p.value as PurchaseReturnStatus]}
          />
        ),
      },
      {
        headerName: '',
        maxWidth: 110,
        cellRenderer: (p: ICellRendererParams<PurchaseReturnItem>) => {
          const row = p.data;
          if (!row) return null;
          return (
            <>
              <Tooltip title="View lines">
                <IconButton size="small" onClick={() => setViewingId(row.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={row.status === 'DRAFT' ? 'Post return' : 'Already posted'}>
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={row.status !== 'DRAFT'}
                    onClick={() => setPosting(row)}
                  >
                    <PublishIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          );
        },
      },
    ],
    [],
  );

  return (
    <PageContainer
      title="Purchase returns"
      subtitle="Send goods back to a supplier; posting removes the stock and raises a debit note."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New return
        </Button>
      }
    >
      <Stack spacing={1}>
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

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            select
            label="Supplier"
            size="small"
            fullWidth={false}
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 200 }}
          >
            <MenuItem value="">All suppliers</MenuItem>
            {(suppliers.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Branch"
            size="small"
            fullWidth={false}
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              pagination.setPage(1);
            }}
            sx={{ width: 180 }}
          >
            <MenuItem value="">All branches</MenuItem>
            {(branches.data ?? []).map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by return number, reason or supplier…"
          height={600}
        />
      </Stack>

      <PurchaseReturnDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(returnNumber) => {
          setCreateOpen(false);
          setNotice(`${returnNumber} saved as draft — post it to remove the stock.`);
        }}
      />

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.returnNumber ?? 'Purchase return'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.supplierName} · {detail.data.branchName} · {detail.data.godownName} ·{' '}
                {new Date(detail.data.returnDate).toLocaleDateString()} · {detail.data.reason}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Batch / Shade</TableCell>
                    <TableCell align="right">Returned</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.data.lines ?? []).map((line) => {
                    const qty = formatBoxPieces(
                      line.qtyBoxes,
                      line.piecesPerBox,
                      line.baseUom === 'PIECE',
                    );
                    return (
                      <TableRow key={line.id}>
                        <TableCell>{line.sku}</TableCell>
                        <TableCell>{line.productName}</TableCell>
                        <TableCell>
                          {[line.batchNo, line.shade].filter(Boolean).join(' / ') || '—'}
                        </TableCell>
                        <TableCell align="right">{qty}</TableCell>
                        <TableCell align="right">{money(line.rate)}</TableCell>
                        <TableCell align="right">{money(line.lineTotal)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Stack direction="row" spacing={3} justifyContent="flex-end">
                <Typography variant="body2">Sub total: {money(detail.data.subTotal)}</Typography>
                <Typography variant="body2">GST: {money(detail.data.gstAmount)}</Typography>
                <Typography variant="subtitle2">
                  Debit note: {money(detail.data.grandTotal)}
                </Typography>
              </Stack>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={posting !== null}
        title="Post return"
        message={`Post ${posting?.returnNumber}? The goods are removed from stock and a debit note of ${posting ? money(posting.grandTotal) : ''} is raised.`}
        confirmLabel="Post"
        onCancel={() => setPosting(null)}
        onConfirm={async () => {
          if (!posting) return;
          try {
            await postReturn.mutateAsync({ id: posting.id, version: posting.version });
            setNotice(`${posting.returnNumber} posted — stock updated.`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to post');
          } finally {
            setPosting(null);
          }
        }}
      />
    </PageContainer>
  );
}
