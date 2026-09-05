import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { GoodsReceiptLineInput } from '@tiles-erp/shared-types';
import { useSaveShortcut } from '@tiles-erp/ui';
import { formatBoxPieces } from '@tiles-erp/shared';
import { ApiError } from '../../lib/api-client';
import { useGodowns } from '../inventory/api';
import { useBranches } from '../products/branch-prices-api';
import { usePostGoodsReceipt, usePurchaseOrder, useReceivableOrders, useSuppliers } from './api';

/** Per order-line receipt entry. */
interface LineDraft {
  qtyBoxes: string;
  batchNo: string;
  shade: string;
}

interface GoodsReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  onPosted: (grnNumber: string) => void;
}

/**
 * Receives goods against an approved purchase order. Each order line shows what is
 * still pending, and the entry defaults to receiving the full outstanding quantity.
 */
export function GoodsReceiptDialog({
  open,
  onClose,
  onPosted,
}: GoodsReceiptDialogProps): JSX.Element {
  const branches = useBranches();
  const suppliers = useSuppliers();
  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [godownId, setGodownId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [error, setError] = useState<string | null>(null);

  const godowns = useGodowns(branchId || undefined);
  const orders = useReceivableOrders(branchId || undefined, supplierId || undefined);
  const order = usePurchaseOrder(orderId || null);
  const postReceipt = usePostGoodsReceipt();

  useEffect(() => {
    if (!open) {
      setOrderId('');
      setDrafts({});
      setInvoiceNo('');
      setRemarks('');
      setError(null);
    }
  }, [open]);

  // Default each line to its full pending quantity when an order is chosen.
  useEffect(() => {
    if (!order.data?.lines) return;
    setDrafts(
      Object.fromEntries(
        order.data.lines.map((line) => [
          line.id,
          { qtyBoxes: line.pendingBoxes > 0 ? String(line.pendingBoxes) : '', batchNo: '', shade: '' },
        ]),
      ),
    );
    setSupplierId(order.data.supplierId);
    setBranchId(order.data.branchId);
  }, [order.data]);

  const setDraft = (lineId: string, patch: Partial<LineDraft>): void =>
    setDrafts((prev) => ({ ...prev, [lineId]: { ...prev[lineId]!, ...patch } }));

  const submit = async (): Promise<void> => {
    setError(null);
    if (!orderId) {
      setError('Choose the purchase order being received');
      return;
    }
    if (!godownId) {
      setError('Choose the godown goods are arriving into');
      return;
    }

    const lines: GoodsReceiptLineInput[] = [];
    for (const line of order.data?.lines ?? []) {
      const draft = drafts[line.id];
      if (!draft) continue;
      const qtyBoxes = Number(draft.qtyBoxes || 0);
      if (qtyBoxes <= 0) continue;
      if (qtyBoxes > line.pendingBoxes) {
        setError(
          `${line.sku}: only ${formatBoxPieces(
            line.pendingBoxes,
            line.piecesPerBox,
            line.baseUom === 'PIECE',
          )} pending`,
        );
        return;
      }
      lines.push({
        orderLineId: line.id,
        productId: line.productId,
        qtyBoxes,
        batchNo: draft.batchNo || null,
        shade: draft.shade || null,
      });
    }
    if (lines.length === 0) {
      setError('Enter a received quantity on at least one line');
      return;
    }

    try {
      const result = await postReceipt.mutateAsync({
        orderId,
        supplierId,
        branchId,
        godownId,
        supplierInvoiceNo: invoiceNo || undefined,
        remarks: remarks || undefined,
        lines,
      });
      onPosted(result.grnNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post the receipt');
    }
  };

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Receive goods</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField
              select
              label="Branch"
              size="small"
              fullWidth={false}
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setGodownId('');
                setOrderId('');
              }}
              sx={{ width: 180 }}
            >
              {(branches.data ?? []).map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Supplier"
              size="small"
              fullWidth={false}
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setOrderId('');
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
              label="Purchase order *"
              size="small"
              fullWidth={false}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              sx={{ width: 280 }}
              helperText="Approved or partially received orders"
            >
              {(orders.data ?? []).map((po) => (
                <MenuItem key={po.id} value={po.id}>
                  {po.poNumber} — {po.supplierName}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Into godown *"
              size="small"
              fullWidth={false}
              value={godownId}
              onChange={(e) => setGodownId(e.target.value)}
              disabled={!branchId}
              sx={{ width: 180 }}
            >
              {(godowns.data ?? []).map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Supplier invoice no"
              size="small"
              fullWidth={false}
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              sx={{ width: 190 }}
            />
          </Stack>

          <Divider />

          {!orderId ? (
            <Alert severity="info">Select a purchase order to list its pending lines.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell align="right">Ordered</TableCell>
                  <TableCell align="right">Pending</TableCell>
                  <TableCell align="right">Receiving</TableCell>
                  <TableCell>Batch</TableCell>
                  <TableCell>Shade</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(order.data?.lines ?? []).map((line) => {
                  const draft = drafts[line.id];
                  const done = line.pendingBoxes <= 0;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{line.sku}</TableCell>
                      <TableCell>{line.productName}</TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(line.qtyBoxes, line.piecesPerBox, line.baseUom === 'PIECE')}
                      </TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(
                          line.pendingBoxes,
                          line.piecesPerBox,
                          line.baseUom === 'PIECE',
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          size="small"
                          fullWidth={false}
                          disabled={done}
                          value={draft?.qtyBoxes ?? ''}
                          onChange={(e) => setDraft(line.id, { qtyBoxes: e.target.value })}
                          sx={{ width: 100 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth={false}
                          disabled={done}
                          value={draft?.batchNo ?? ''}
                          onChange={(e) => setDraft(line.id, { batchNo: e.target.value })}
                          sx={{ width: 110 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth={false}
                          disabled={done}
                          value={draft?.shade ?? ''}
                          onChange={(e) => setDraft(line.id, { shade: e.target.value })}
                          sx={{ width: 110 }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <Typography variant="caption" color="text.secondary">
            Posting a receipt adds stock to the selected godown and updates the order status.
          </Typography>

          <TextField
            label="Remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={postReceipt.isPending}
        >
          {postReceipt.isPending ? 'Posting…' : 'Post receipt'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
