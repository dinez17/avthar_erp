import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import InventoryIcon from '@mui/icons-material/Inventory';
import PrintIcon from '@mui/icons-material/Print';
import VisibilityIcon from '@mui/icons-material/Visibility';
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
import { useNavigate } from 'react-router-dom';
import { formatBoxPieces } from '@tiles-erp/shared';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import type { StockTransferItem, TransferStatus } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import { useBranches } from '../products/branch-prices-api';
import { ReceiveTransferDialog } from './ReceiveTransferDialog';
import { TransferDialog } from './TransferDialog';
import { useCancelTransfer, useTransfer, useTransfers } from './transfers-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<TransferStatus, string> = {
  IN_TRANSIT: 'In transit',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

const STATUS_COLOR: Record<TransferStatus, 'warning' | 'success' | 'default'> = {
  IN_TRANSIT: 'warning',
  RECEIVED: 'success',
  CANCELLED: 'default',
};

/**
 * Stock transfers between godowns.
 *
 * A transfer dispatches out of one godown and is received into the other, so the list is
 * as much a worklist — what is still on the road — as it is a history.
 */
export function TransfersPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<TransferStatus | ''>('');
  const { data, isFetching } = useTransfers(pagination.query, {
    branchId: branchId || undefined,
    status: status || undefined,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useTransfer(viewingId);
  const receiving = useTransfer(receivingId);
  const cancelTransfer = useCancelTransfer();

  const submitCancel = async (): Promise<void> => {
    if (!cancellingId) return;
    setError(null);
    try {
      const result = await cancelTransfer.mutateAsync({
        id: cancellingId,
        input: { reason: cancelReason.trim() },
      });
      setCancellingId(null);
      setCancelReason('');
      setNotice(`${result.documentNo} turned back; the stock is home at ${result.fromGodownName}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The transfer could not be cancelled');
    }
  };

  const columns = useMemo<ColDef<StockTransferItem>[]>(
    () => [
      {
        field: 'documentNo',
        headerName: 'Document',
        minWidth: 165,
        cellRenderer: (p: ICellRendererParams<StockTransferItem>) =>
          p.data ? (
            <Stack sx={{ lineHeight: 1.2 }}>
              <span>{p.data.documentNo}</span>
              <Typography variant="caption" color="text.secondary">
                {p.data.documentType === 'TAX_INVOICE' ? 'Tax invoice' : 'Delivery challan'}
              </Typography>
            </Stack>
          ) : null,
      },
      {
        field: 'transferDate',
        headerName: 'Date',
        minWidth: 130,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : ''),
      },
      {
        headerName: 'From',
        minWidth: 190,
        valueGetter: (p) => (p.data ? `${p.data.fromBranchName} · ${p.data.fromGodownName}` : ''),
      },
      {
        headerName: 'To',
        minWidth: 190,
        valueGetter: (p) => (p.data ? `${p.data.toBranchName} · ${p.data.toGodownName}` : ''),
      },
      { field: 'totalBoxes', headerName: 'Boxes', maxWidth: 100 },
      {
        field: 'grandTotal',
        headerName: 'Value',
        maxWidth: 130,
        type: 'rightAligned',
        valueFormatter: (p) => money(Number(p.value ?? 0)),
      },
      {
        field: 'status',
        headerName: 'Status',
        maxWidth: 150,
        cellRenderer: (p: ICellRendererParams<StockTransferItem>) => {
          if (!p.data) return null;
          return (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip
                label={STATUS_LABEL[p.data.status]}
                size="small"
                color={STATUS_COLOR[p.data.status]}
              />
              {p.data.totalShort > 0 && (
                <Tooltip title={`${p.data.totalShort} boxes never arrived`}>
                  <Chip label={`−${p.data.totalShort}`} size="small" color="error" />
                </Tooltip>
              )}
            </Stack>
          );
        },
      },
      {
        headerName: 'E-way',
        maxWidth: 110,
        cellRenderer: (p: ICellRendererParams<StockTransferItem>) => {
          if (!p.data) return null;
          if (p.data.ewayBillNo) {
            return (
              <Typography variant="caption" fontFamily="monospace">
                {p.data.ewayBillNo}
              </Typography>
            );
          }
          return p.data.ewayBillMissing ? (
            <Tooltip title="Consignment is over the threshold and has no e-way bill">
              <Chip label="Missing" size="small" color="error" />
            </Tooltip>
          ) : (
            <Typography variant="caption" color="text.secondary">
              —
            </Typography>
          );
        },
      },
      {
        headerName: '',
        minWidth: 150,
        maxWidth: 160,
        cellRenderer: (p: ICellRendererParams<StockTransferItem>) => {
          if (!p.data) return null;
          const open = p.data.status === 'IN_TRANSIT';
          return (
            <Stack direction="row" spacing={0}>
              <Tooltip title="Lines">
                <IconButton size="small" onClick={() => setViewingId(p.data!.id)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Print the document">
                <IconButton
                  size="small"
                  onClick={() => navigate(`/stock/transfers/${p.data!.id}/print`)}
                >
                  <PrintIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {open && (
                <>
                  <Tooltip title="Receive at the destination">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => setReceivingId(p.data!.id)}
                    >
                      <InventoryIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Turn it back">
                    <IconButton size="small" onClick={() => setCancellingId(p.data!.id)}>
                      <BlockIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          );
        },
      },
    ],
    [navigate],
  );

  return (
    <PageContainer
      title="Stock transfers"
      subtitle="Goods leave one godown and are booked in at the other; a challan or tax invoice travels with them."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New transfer
        </Button>
      }
    >
      <Stack spacing={1}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        <Stack direction="row" spacing={1}>
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
            sx={{ width: 200 }}
            helperText="Transfers into or out of this branch"
          >
            <MenuItem value="">All branches</MenuItem>
            {(branches.data ?? []).map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Status"
            size="small"
            fullWidth={false}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TransferStatus | '');
              pagination.setPage(1);
            }}
            sx={{ width: 170 }}
            helperText="In transit is the worklist"
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="IN_TRANSIT">In transit</MenuItem>
            <MenuItem value="RECEIVED">Received</MenuItem>
            <MenuItem value="CANCELLED">Cancelled</MenuItem>
          </TextField>
        </Stack>

        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by document, transfer, LR or e-way bill number…"
          height={600}
        />
      </Stack>

      <TransferDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPosted={(documentNo) => {
          setCreateOpen(false);
          setNotice(`${documentNo} dispatched. Receive it at the destination when it arrives.`);
        }}
      />

      <ReceiveTransferDialog
        transfer={receiving.data ?? null}
        onClose={() => setReceivingId(null)}
        onReceived={(documentNo) => {
          setReceivingId(null);
          setNotice(`${documentNo} received.`);
        }}
      />

      <Dialog
        open={cancellingId !== null}
        onClose={() => setCancellingId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Turn this transfer back?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2">
              The stock goes back to the source godown as a fresh movement. The document stays on
              record, cancelled.
            </Typography>
            <TextField
              label="Reason"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              multiline
              minRows={2}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setCancellingId(null)}>
            Keep it
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={!cancelReason.trim() || cancelTransfer.isPending}
            onClick={() => void submitCancel()}
          >
            {cancelTransfer.isPending ? 'Turning back…' : 'Turn back'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={viewingId !== null} onClose={() => setViewingId(null)} maxWidth="md" fullWidth>
        <DialogTitle>{detail.data?.documentNo ?? 'Transfer'}</DialogTitle>
        <DialogContent>
          {detail.data && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {detail.data.fromBranchName} · {detail.data.fromGodownName} →{' '}
                {detail.data.toBranchName} · {detail.data.toGodownName}
                {' · '}
                {new Date(detail.data.transferDate).toLocaleString()}
                {detail.data.transporterName ? ` · ${detail.data.transporterName}` : ''}
                {detail.data.vehicleNumber ? ` · ${detail.data.vehicleNumber}` : ''}
              </Typography>
              {detail.data.remarks && (
                <Typography variant="body2">{detail.data.remarks}</Typography>
              )}
              {detail.data.status === 'CANCELLED' && detail.data.cancelReason && (
                <Alert severity="warning">Cancelled: {detail.data.cancelReason}</Alert>
              )}
              {detail.data.receivedByName && (
                <Alert severity="success">
                  Received by {detail.data.receivedByName}
                  {detail.data.receiptRemarks ? ` — ${detail.data.receiptRemarks}` : ''}
                </Alert>
              )}

              <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell>Batch / Shade</TableCell>
                    <TableCell align="right">Sent</TableCell>
                    <TableCell align="right">Received</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(detail.data.lines ?? []).map((line) => (
                    <TableRow key={`${line.productId}-${line.batchNo}-${line.shade}`}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell>
                        {[line.batchNo, line.shade].filter(Boolean).join(' / ') || '—'}
                      </TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(
                          line.qtyBoxes,
                          line.piecesPerBox,
                          line.baseUom === 'PIECE',
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {line.qtyReceived === null ? (
                          <Typography variant="caption" color="text.secondary">
                            In transit
                          </Typography>
                        ) : (
                          <>
                            {formatBoxPieces(
                              line.qtyReceived,
                              line.piecesPerBox,
                              line.baseUom === 'PIECE',
                            )}
                            {line.qtyShort > 0 && (
                              <Chip
                                label={`−${line.qtyShort}`}
                                size="small"
                                color="error"
                                sx={{ ml: 0.5 }}
                              />
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell align="right">{money(line.rate)}</TableCell>
                      <TableCell align="right">{money(line.lineSubTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Stack direction="row" spacing={3} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" color="text.secondary">
                  Value ₹{money(detail.data.subTotal)}
                </Typography>
                {detail.data.gstAmount > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Tax ₹{money(detail.data.gstAmount)}
                  </Typography>
                )}
                {detail.data.freightCharge > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Freight cost ₹{money(detail.data.freightCharge)}
                  </Typography>
                )}
                <Typography variant="body2" fontWeight={700}>
                  Consignment ₹{money(detail.data.grandTotal)}
                </Typography>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<PrintIcon />}
            onClick={() => detail.data && navigate(`/stock/transfers/${detail.data.id}/print`)}
          >
            Print
          </Button>
          <Button color="inherit" onClick={() => setViewingId(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
