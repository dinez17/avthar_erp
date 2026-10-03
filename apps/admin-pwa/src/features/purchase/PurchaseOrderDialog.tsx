import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Autocomplete,
  Box,
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
  productLabel: string;
  qtyBoxes: string;
  rate: string;
  discountPct: string;
  gstRate: string;
}

const blankLine: DraftLine = { productId: '', productLabel: '', qtyBoxes: '', rate: '', discountPct: '0', gstRate: '' };

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
  const [productSearch, setProductSearch] = useState('');
  const products = useProducts(
    { page: 1, pageSize: 50, sortOrder: 'asc', search: productSearch || undefined },
    {},
  );
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
          productLabel: `${line.sku} · ${line.productName}`,
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
            <Autocomplete
              size="small"
              options={suppliers.data ?? []}
              getOptionLabel={(supplier) => `${supplier.name}${supplier.phone ? ` · ${supplier.phone}` : ''}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={(suppliers.data ?? []).find((supplier) => supplier.id === supplierId) ?? null}
              onChange={(_, supplier) => setSupplierId(supplier?.id ?? '')}
              sx={{ width: { xs: '100%', sm: 300 } }}
              renderInput={(params) => (
                <TextField {...params} label="Supplier *" placeholder="Search supplier name or phone" />
              )}
            />
            <TextField
              select
              label="Delivery address *"
              size="small"
              fullWidth={false}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              sx={{ width: 200 }}
            >
              {(branches.data ?? []).map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}{b.city ? ` · ${b.city}` : ''}{b.pincode ? ` · ${b.pincode}` : ''}
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
              <Box
                key={index}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'repeat(2, minmax(0, 1fr))',
                    md: 'minmax(280px, 2.4fr) repeat(4, minmax(85px, 0.8fr)) 130px 40px',
                  },
                  gap: 1,
                  alignItems: 'center',
                  p: { xs: 1.25, md: 0 },
                  border: { xs: 1, md: 0 },
                  borderColor: 'divider',
                  borderRadius: { xs: 2, md: 0 },
                }}
              >
                <Autocomplete
                  size="small"
                  options={products.data?.items ?? []}
                  filterOptions={(options) => options}
                  loading={products.isFetching}
                  getOptionLabel={(product) => `${product.sku} · ${product.name}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  value={productById.get(line.productId) ?? null}
                  inputValue={line.productLabel}
                  onInputChange={(_, value, reason) => {
                    if (reason === 'input') {
                      setLine(index, { productLabel: value });
                      setProductSearch(value);
                    }
                  }}
                  onChange={(_, product) => {
                    setLine(index, {
                      productId: product?.id ?? '',
                      productLabel: product ? `${product.sku} · ${product.name}` : '',
                      gstRate: product ? String(product.gstRate) : '',
                      rate: line.rate || (product?.purchaseRate ? String(product.purchaseRate) : ''),
                    });
                    if (product && index === lines.length - 1) {
                      setLines((previous) => [...previous, { ...blankLine }]);
                    }
                  }}
                  sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
                  renderInput={(params) => (
                    <TextField {...params} label="Product" placeholder="Search SKU or product name" />
                  )}
                />
                <TextField
                  label="Boxes"
                  type="number"
                  size="small"
                  fullWidth
                  value={line.qtyBoxes}
                  onChange={(e) => setLine(index, { qtyBoxes: e.target.value })}
                />
                <TextField
                  label="Rate ₹"
                  type="number"
                  size="small"
                  fullWidth
                  value={line.rate}
                  onChange={(e) => setLine(index, { rate: e.target.value })}
                />
                <TextField
                  label="Disc %"
                  type="number"
                  size="small"
                  fullWidth
                  value={line.discountPct}
                  onChange={(e) => setLine(index, { discountPct: e.target.value })}
                />
                <TextField
                  label="GST %"
                  type="number"
                  size="small"
                  fullWidth
                  value={line.gstRate}
                  onChange={(e) => setLine(index, { gstRate: e.target.value })}
                />
                <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 700 }}>
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ display: { xs: 'inline', md: 'none' }, mr: 0.5 }}>
                    Total
                  </Typography>
                  {money(amounts?.lineTotal ?? 0)}
                </Typography>
                <IconButton
                  aria-label="Remove line"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  disabled={lines.length === 1}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })}

          <Button
            startIcon={<AddIcon />}
            onClick={() => setLines((prev) => [...prev, { ...blankLine }])}
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
