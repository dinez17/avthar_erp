import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { calculatePurchaseLine, sumPurchaseTotals } from '@tiles-erp/shared';
import type { PurchaseOrderItem, PurchaseOrderLineInput } from '@tiles-erp/shared-types';
import { useSaveShortcut } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { useProducts } from '../products/api';
import { useBranches } from '../products/branch-prices-api';
import { useCreatePurchaseOrder, useSuppliers, useUpdatePurchaseOrder } from './api';

interface DraftLine {
  productId: string;
  qtyBoxes: string;
  rate: string;
  discountPct: string;
  gstRate: string;
}

const blankLine: DraftLine = { productId: '', qtyBoxes: '', rate: '', discountPct: '0', gstRate: '' };

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PurchaseOrderDialogProps {
  open: boolean;
  /** Existing draft being edited, or null when creating. */
  editing: PurchaseOrderItem | null;
  onClose: () => void;
  onSaved: (poNumber: string) => void;
}

/** Creates or edits a draft purchase order, with totals computed as you type. */
export function PurchaseOrderDialog({
  open,
  editing,
  onClose,
  onSaved,
}: PurchaseOrderDialogProps): JSX.Element {
  const suppliers = useSuppliers();
  const branches = useBranches();
  const products = useProducts({ page: 1, pageSize: 200, sortOrder: 'asc' }, {});
  const createOrder = useCreatePurchaseOrder();
  const updateOrder = useUpdatePurchaseOrder();

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSupplierId(editing.supplierId);
      setBranchId(editing.branchId);
      setExpectedDate(editing.expectedDate ? editing.expectedDate.slice(0, 10) : '');
      setRemarks(editing.remarks ?? '');
      setLines(
        (editing.lines ?? []).map((line) => ({
          productId: line.productId,
          qtyBoxes: String(line.qtyBoxes),
          rate: String(line.rate),
          discountPct: String(line.discountPct),
          gstRate: String(line.gstRate),
        })),
      );
    } else {
      setSupplierId('');
      setBranchId('');
      setExpectedDate('');
      setRemarks('');
      setLines([blankLine]);
    }
    setError(null);
  }, [open, editing]);

  const productById = useMemo(
    () => new Map((products.data?.items ?? []).map((p) => [p.id, p])),
    [products.data],
  );

  /** Line amounts previewed with the same formula the API uses. */
  const computed = lines.map((line) => {
    const qty = Number(line.qtyBoxes || 0);
    const rate = Number(line.rate || 0);
    const discount = Number(line.discountPct || 0);
    const gst = Number(line.gstRate || productById.get(line.productId)?.gstRate || 0);
    return calculatePurchaseLine(qty, rate, discount, gst);
  });
  const totals = sumPurchaseTotals(computed);

  const setLine = (index: number, patch: Partial<DraftLine>): void =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const submit = async (): Promise<void> => {
    setError(null);
    if (!supplierId || !branchId) {
      setError('Choose a supplier and a branch');
      return;
    }

    const payload: PurchaseOrderLineInput[] = [];
    for (const line of lines) {
      if (!line.productId) continue;
      const qtyBoxes = Number(line.qtyBoxes || 0);
      const rate = Number(line.rate || 0);
      if (qtyBoxes <= 0) {
        setError('Every line needs a quantity greater than zero');
        return;
      }
      payload.push({
        productId: line.productId,
        qtyBoxes,
        rate,
        discountPct: Number(line.discountPct || 0),
        ...(line.gstRate ? { gstRate: Number(line.gstRate) } : {}),
      });
    }
    if (payload.length === 0) {
      setError('Add at least one line');
      return;
    }

    try {
      const result = editing
        ? await updateOrder.mutateAsync({
            id: editing.id,
            supplierId,
            branchId,
            expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
            remarks: remarks || undefined,
            lines: payload,
            version: editing.version,
          })
        : await createOrder.mutateAsync({
            supplierId,
            branchId,
            expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
            remarks: remarks || undefined,
            lines: payload,
          });
      onSaved(result.poNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the order');
    }
  };

  const pending = createOrder.isPending || updateOrder.isPending;

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{editing ? `Edit ${editing.poNumber}` : 'New purchase order'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <TextField
              select
              label="Supplier *"
              size="small"
              fullWidth={false}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              sx={{ width: 240 }}
            >
              {(suppliers.data ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Branch *"
              size="small"
              fullWidth={false}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              sx={{ width: 200 }}
            >
              {(branches.data ?? []).map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Expected date"
              type="date"
              size="small"
              fullWidth={false}
              InputLabelProps={{ shrink: true }}
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              sx={{ width: 180 }}
            />
          </Stack>

          <Divider />
          <Typography variant="subtitle2">Lines</Typography>

          {lines.map((line, index) => {
            const amounts = computed[index];
            return (
              <Stack key={index} direction="row" spacing={1} alignItems="center">
                <TextField
                  select
                  label="Product"
                  size="small"
                  fullWidth={false}
                  value={line.productId}
                  onChange={(e) => {
                    const product = productById.get(e.target.value);
                    setLine(index, {
                      productId: e.target.value,
                      gstRate: product ? String(product.gstRate) : '',
                      rate: line.rate || (product?.purchaseRate ? String(product.purchaseRate) : ''),
                    });
                  }}
                  sx={{ width: 300 }}
                >
                  {(products.data?.items ?? []).map((product) => (
                    <MenuItem key={product.id} value={product.id}>
                      {product.sku} — {product.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Boxes"
                  type="number"
                  size="small"
                  fullWidth={false}
                  value={line.qtyBoxes}
                  onChange={(e) => setLine(index, { qtyBoxes: e.target.value })}
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Rate ₹"
                  type="number"
                  size="small"
                  fullWidth={false}
                  value={line.rate}
                  onChange={(e) => setLine(index, { rate: e.target.value })}
                  sx={{ width: 110 }}
                />
                <TextField
                  label="Disc %"
                  type="number"
                  size="small"
                  fullWidth={false}
                  value={line.discountPct}
                  onChange={(e) => setLine(index, { discountPct: e.target.value })}
                  sx={{ width: 90 }}
                />
                <TextField
                  label="GST %"
                  type="number"
                  size="small"
                  fullWidth={false}
                  value={line.gstRate}
                  onChange={(e) => setLine(index, { gstRate: e.target.value })}
                  sx={{ width: 90 }}
                />
                <Typography variant="body2" sx={{ width: 130, textAlign: 'right', fontWeight: 600 }}>
                  {money(amounts?.lineTotal ?? 0)}
                </Typography>
                <IconButton
                  aria-label="Remove line"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  disabled={lines.length === 1}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })}

          <Button
            startIcon={<AddIcon />}
            onClick={() => setLines((prev) => [...prev, blankLine])}
            sx={{ alignSelf: 'flex-start' }}
          >
            Add line
          </Button>

          <Divider />
          <Stack direction="row" spacing={3} justifyContent="flex-end">
            <Typography variant="body2">Sub total: {money(totals.subTotal)}</Typography>
            <Typography variant="body2">GST: {money(totals.gstAmount)}</Typography>
            <Typography variant="subtitle2">Total: {money(totals.grandTotal)}</Typography>
          </Stack>

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
        <Button variant="contained" onClick={() => void submit()} disabled={pending}>
          {pending ? 'Saving…' : editing ? 'Save draft' : 'Create draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
