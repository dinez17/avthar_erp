import AddIcon from '@mui/icons-material/Add';
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
import { PageContainer } from '@tiles-erp/ui';
import type { GoodsReceiptItem } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { useBranches } from '../products/branch-prices-api';
import { GoodsReceiptDialog } from './GoodsReceiptDialog';
import { useGoodsReceipt, useGoodsReceipts, useSuppliers } from './api';

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Goods receipts: what arrived, when, and into which godown. */
export function GoodsReceiptsPage(): JSX.Element {
  const pagination = usePagination();
  const suppliers = useSuppliers();
  const branches = useBranches();
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');

  const { data, isFetching } = useGoodsReceipts(pagination.query, {
    supplierId: supplierId || undefined,
    branchId: branchId || undefined,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const detail = useGoodsReceipt(viewingId);

  const columns = useMemo<ColDef<GoodsReceiptItem>[]>(
    () => [
      { field: 'grnNumber', headerName: 'GRN number', minWidth: 160 },
      {
        field: 'receiptDate',
        headerName: 'Date',
        minWidth: 130,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      { field: 'supplierName', headerName: 'Supplier', minWidth: 180 },
      {
        field: 'poNumber',
        headerName: 'Against PO',
        minWidth: 150,
        cellRenderer: (p: ICellRendererParams<GoodsReceiptItem>) =>
          p.value ? (
            <Chip label={p.value as string} size="small" color="info" />
          ) : (
            <Chip label="Direct" size="small" />
          ),
      },
      { field: 'godownName', headerName: 'Godown', minWidth: 140 },
      { field: 'supplierInvoiceNo', headerName: 'Invoice no', minWidth: 140 },
      { field: 'lineCount', headerName: 'Lines', maxWidth: 90 },
      { field: 'totalBoxes', headerName: 'Boxes', maxWidth: 110 },
      {
        headerName: 'Billed',
        minWidth: 150,
        // The receipts still to bill are the work; the ones already done are the noise.
        cellRenderer: (p: ICellRendererParams<GoodsReceiptItem>) => {
          const grn = p.data;
          if (!grn) return null;
          return grn.invoiced ? (
            <Tooltip title={grn.invoiceNumbers.join(', ')}>
              <Chip label={grn.invoiceNumbers[0] ?? 'Billed'} size="small" color="success" />
            </Tooltip>
          ) : (
            <Chip label="To bill" size="small" color="warning" variant="outlined" />
          );
        },
      },
      {
        headerName: '',
        maxWidth: 70,
        cellRenderer: (p: ICellRendererParams<GoodsReceiptItem>) => (
          <IconButton size="small" onClick={() => p.data && setViewingId(p.data.id)}>
            <VisibilityIcon fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [],
  );

  return (
    <PageContainer
      title="Goods receipts"
      subtitle="Receive against approved orders; stock is added and the order updated automatically."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Receive goods
        </Button>
      }
    >
      <Stack spacing={1}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
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
          searchPlaceholder="Search by GRN, PO or invoice number…"
          height={600}
        />
      </Stack>

      <GoodsReceiptDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPosted={(grnNumber) => {
          setCreateOpen(false);
          setNotice(`${grnNumber} posted — stock updated.`);
        }}
      />

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.grnNumber ?? 'Goods receipt'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.supplierName} · {detail.data.branchName} ·{' '}
                {detail.data.godownName} ·{' '}
                {new Date(detail.data.receiptDate).toLocaleDateString()}
                {detail.data.poNumber ? ` · against ${detail.data.poNumber}` : ' · direct receipt'}
              </Typography>
              {detail.data.remarks && (
                <Typography variant="body2">{detail.data.remarks}</Typography>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Batch / Shade</TableCell>
                    <TableCell align="right">Received</TableCell>
                    <TableCell align="right">Rate</TableCell>
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
