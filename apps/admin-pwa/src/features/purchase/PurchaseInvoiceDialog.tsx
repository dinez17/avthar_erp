import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Autocomplete,
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
import { apportionCharge, calculatePurchaseLine, sumPurchaseTotals } from '@tiles-erp/shared';
import type { PurchaseInvoiceItem, PurchaseInvoiceLineInput } from '@tiles-erp/shared-types';
import { useSaveShortcut } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { useProducts } from '../products/api';
import { useBranches } from '../products/branch-prices-api';
import { useGodowns } from '../inventory/api';
import { useGoodsReceipt, useGoodsReceipts, useSuppliers } from './api';
import { useCreatePurchaseInvoice, useUpdatePurchaseInvoice } from './invoices-api';

interface DraftLine {
  productId: string;
  productLabel: string;
  qtyBoxes: string;
  rate: string;
  /** Taxable line total entered on the supplier bill, excluding GST. */
  totalAmount: string;
  amountDriven: boolean;
  discountPct: string;
  gstRate: string;
}

const blankLine: DraftLine = { productId: '', productLabel: '', qtyBoxes: '', rate: '', totalAmount: '', amountDriven: false, discountPct: '0', gstRate: '' };

const totalFor = (line: Pick<DraftLine, 'qtyBoxes' | 'rate' | 'discountPct'>): string => {
  const result = calculatePurchaseLine(
    Number(line.qtyBoxes || 0),
    Number(line.rate || 0),
    Number(line.discountPct || 0),
    0,
  ).lineSubTotal;
  return result > 0 ? result.toFixed(2) : '';
};

const rateFromTotal = (total: string, line: DraftLine): string => {
  const qty = Number(line.qtyBoxes || 0);
  const amount = Number(total || 0);
  const discountFactor = 1 - Number(line.discountPct || 0) / 100;
  if (qty <= 0 || amount < 0 || discountFactor <= 0) return line.rate;
  return String(Math.round((amount / qty / discountFactor) * 1_000_000) / 1_000_000);
};

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PurchaseInvoiceDialogProps {
  open: boolean;
  /** Draft being edited, or null when entering a new invoice. */
  editing: PurchaseInvoiceItem | null;
  onClose: () => void;
  onSaved: (invoiceNumber: string) => void;
}

/**
 * Enters a supplier invoice, optionally pre-filled from a goods receipt. Landing cost
 * per box previews live, including the apportioned share of transport and other charges.
 */
export function PurchaseInvoiceDialog({
  open,
  editing,
  onClose,
  onSaved,
}: PurchaseInvoiceDialogProps): JSX.Element {
  const suppliers = useSuppliers();
  const branches = useBranches();
  const [productSearch, setProductSearch] = useState('');
  const products = useProducts(
    { page: 1, pageSize: 50, sortOrder: 'asc', search: productSearch || undefined },
    {},
  );
  const createInvoice = useCreatePurchaseInvoice();
  const updateInvoice = useUpdatePurchaseInvoice();

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [godownId, setGodownId] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [transportCharge, setTransportCharge] = useState('0');
  const [additionalCharge, setAdditionalCharge] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine]);
  const [error, setError] = useState<string | null>(null);

  // Only receipts with nothing billed against them: invoicing the same GRN twice would
  // double the stock's landed cost and the supplier's balance.
  const receipts = useGoodsReceipts(
    { page: 1, pageSize: 100, sortOrder: 'desc' },
    { supplierId: supplierId || undefined, branchId: branchId || undefined },
    true,
  );
  const receipt = useGoodsReceipt(receiptId || null);
  const godowns = useGodowns(branchId || undefined);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setSupplierId(editing.supplierId);
      setBranchId(editing.branchId);
      setGodownId(editing.godownId ?? '');
      setReceiptId(editing.receiptId ?? '');
      setSupplierInvoiceNo(editing.supplierInvoiceNo);
      setTransportCharge(String(editing.transportCharge));
      setAdditionalCharge(String(editing.additionalCharge));
      setRemarks(editing.remarks ?? '');
      setLines(
        (editing.lines ?? []).map((line) => ({
          productId: line.productId,
          productLabel: `${line.sku} · ${line.productName}`,
          qtyBoxes: String(line.qtyBoxes),
          rate: String(line.rate),
          totalAmount: String(line.lineSubTotal),
          amountDriven: false,
          discountPct: String(line.discountPct),
          gstRate: String(line.gstRate),
        })),
      );
      return;
    }
    setSupplierId('');
    setBranchId('');
    setGodownId('');
    setReceiptId('');
    setSupplierInvoiceNo('');
    setTransportCharge('0');
    setAdditionalCharge('0');
    setRemarks('');
    setLines([blankLine]);
  }, [open, editing]);

  const productById = useMemo(
    () => new Map((products.data?.items ?? []).map((p) => [p.id, p])),
    [products.data],
  );

  // Selecting a receipt copies its lines in, so the bill is checked against what arrived.
  useEffect(() => {
    if (editing) return;
    if (!receipt.data?.lines) return;
    setSupplierId(receipt.data.supplierId);
    setBranchId(receipt.data.branchId);
    setGodownId(receipt.data.godownId);
    if (receipt.data.supplierInvoiceNo) setSupplierInvoiceNo(receipt.data.supplierInvoiceNo);
    setLines(
      receipt.data.lines.map((line) => ({
        productId: line.productId,
        productLabel: `${line.sku} · ${line.productName}`,
        qtyBoxes: String(line.qtyBoxes),
        rate: String(line.rate),
        totalAmount: calculatePurchaseLine(
          Number(line.qtyBoxes),
          Number(line.rate),
          0,
          Number(productById.get(line.productId)?.gstRate ?? 0),
        ).lineSubTotal.toFixed(2),
        amountDriven: false,
        discountPct: '0',
        gstRate: String(productById.get(line.productId)?.gstRate ?? ''),
      })),
    );
  }, [receipt.data, productById, editing]);

  const computed = lines.map((line) => {
    const qty = Number(line.qtyBoxes || 0);
    const rate = Number(line.rate || 0);
    const discount = Number(line.discountPct || 0);
    const gst = Number(line.gstRate || productById.get(line.productId)?.gstRate || 0);
    return { qty, ...calculatePurchaseLine(qty, rate, discount, gst) };
  });
  const totals = sumPurchaseTotals(computed);
  const totalBoxes = computed.reduce((sum, line) => sum + line.qty, 0);
  const charges = Number(transportCharge || 0) + Number(additionalCharge || 0);
  const shares = apportionCharge(
    computed.map((c) => c.lineSubTotal),
    charges,
  );

  const setLine = (index: number, patch: Partial<DraftLine>): void =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const submit = async (): Promise<void> => {
    setError(null);
    if (!supplierId || !branchId) {
      setError('Choose a supplier and branch');
      return;
    }
    if (!receiptId && !godownId) {
      setError('Choose the godown receiving this stock');
      return;
    }
    if (!supplierInvoiceNo.trim()) {
      setError("Enter the supplier's invoice number");
      return;
    }

    const payload: PurchaseInvoiceLineInput[] = [];
    for (const line of lines) {
      if (!line.productId) continue;
      const qtyBoxes = Number(line.qtyBoxes || 0);
      if (qtyBoxes <= 0) {
        setError('Every line needs a quantity greater than zero');
        return;
      }
      payload.push({
        productId: line.productId,
        qtyBoxes,
        rate: Number(line.rate || 0),
        discountPct: Number(line.discountPct || 0),
        ...(line.gstRate ? { gstRate: Number(line.gstRate) } : {}),
      });
    }
    if (payload.length === 0) {
      setError('Add at least one line');
      return;
    }

    try {
      const body = {
        supplierInvoiceNo: supplierInvoiceNo.trim(),
        supplierId,
        branchId,
        godownId: godownId || null,
        receiptId: receiptId || null,
        transportCharge: Number(transportCharge || 0),
        additionalCharge: Number(additionalCharge || 0),
        remarks: remarks || undefined,
        lines: payload,
      };
      const result = editing
        ? await updateInvoice.mutateAsync({ id: editing.id, ...body, version: editing.version })
        : await createInvoice.mutateAsync(body);
      onSaved(result.invoiceNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the invoice');
    }
  };

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{editing ? `Edit ${editing.invoiceNumber}` : 'New purchase invoice'}</DialogTitle>
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
              onChange={(_, supplier) => {
                setSupplierId(supplier?.id ?? '');
                setReceiptId('');
              }}
              sx={{ width: { xs: '100%', sm: 300 } }}
              renderInput={(params) => (
                <TextField {...params} label="Supplier *" placeholder="Search supplier name or phone" />
              )}
            />
            <TextField
              select
              label="Branch *"
              size="small"
              fullWidth={false}
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setGodownId('');
                setReceiptId('');
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
              label="Receiving godown *"
              size="small"
              fullWidth={false}
              value={godownId}
              onChange={(e) => setGodownId(e.target.value)}
              disabled={!branchId || Boolean(receiptId)}
              sx={{ width: 220 }}
              helperText={receiptId ? 'Taken from the selected GRN' : 'Stock is added here when posted'}
            >
              {(godowns.data ?? []).map((godown) => (
                <MenuItem key={godown.id} value={godown.id}>
                  {godown.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Against GRN"
              size="small"
              fullWidth={false}
              value={receiptId}
              onChange={(e) => {
                setReceiptId(e.target.value);
                if (!e.target.value) setGodownId('');
              }}
              sx={{ width: 220 }}
              error={receipts.isError}
              helperText={
                receipts.isError
                  ? 'Receipts could not be loaded — is the API running the current build?'
                  : receipts.isLoading
                    ? 'Loading receipts…'
                    : (receipts.data?.items ?? []).length === 0
                      ? 'Nothing left to bill for this supplier'
                      : 'Copies the received lines'
              }
            >
              <MenuItem value="">None (manual entry)</MenuItem>
              {/*
                While editing, the receipt this invoice is already against is not in the
                uninvoiced list — it is invoiced, by this very invoice — so it is added
                back or the field would blank itself on open.
              */}
              {editing?.receiptId &&
                !(receipts.data?.items ?? []).some((grn) => grn.id === editing.receiptId) && (
                  <MenuItem value={editing.receiptId}>
                    {receipt.data?.grnNumber ?? 'Current GRN'}
                  </MenuItem>
                )}
              {(receipts.data?.items ?? []).map((grn) => (
                <MenuItem key={grn.id} value={grn.id}>
                  {grn.grnNumber}
                  {grn.poNumber ? ` · ${grn.poNumber}` : ''}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Supplier invoice no *"
              size="small"
              fullWidth={false}
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              sx={{ width: 190 }}
            />
          </Stack>

          <Divider />
          <Typography variant="subtitle2">Lines</Typography>

          {lines.map((line, index) => (
            <Stack key={index} direction="row" spacing={1} alignItems="center">
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
                  const nextRate = line.rate || (product?.purchaseRate ? String(product.purchaseRate) : '');
                  const nextGst = product ? String(product.gstRate) : '';
                  setLine(index, {
                    productId: product?.id ?? '',
                    productLabel: product ? `${product.sku} · ${product.name}` : '',
                    gstRate: nextGst,
                    rate: nextRate,
                    totalAmount: totalFor({ ...line, rate: nextRate }),
                    amountDriven: false,
                  });
                  if (product && index === lines.length - 1) {
                    setLines((previous) => [...previous, { ...blankLine }]);
                  }
                }}
                sx={{ width: 420, minWidth: 360 }}
                renderInput={(params) => (
                  <TextField {...params} label="Product" placeholder="Search SKU or product name" />
                )}
              />
              <TextField
                label="Boxes"
                type="number"
                size="small"
                fullWidth={false}
                value={line.qtyBoxes}
                onChange={(e) => {
                  const qtyBoxes = e.target.value;
                  const next = { ...line, qtyBoxes };
                  setLine(index, line.amountDriven
                    ? { qtyBoxes, rate: rateFromTotal(line.totalAmount, next) }
                    : { qtyBoxes, totalAmount: totalFor(next) });
                }}
                sx={{ width: 95 }}
              />
              <TextField
                label="Rate ₹"
                type="number"
                size="small"
                fullWidth={false}
                value={line.rate}
                onChange={(e) => {
                  const rate = e.target.value;
                  setLine(index, { rate, totalAmount: totalFor({ ...line, rate }), amountDriven: false });
                }}
                sx={{ width: 105 }}
              />
              <TextField
                label="Total excl GST ₹"
                type="number"
                size="small"
                fullWidth={false}
                value={line.totalAmount}
                onChange={(e) => {
                  const totalAmount = e.target.value;
                  setLine(index, { totalAmount, rate: rateFromTotal(totalAmount, line), amountDriven: true });
                }}
                helperText="Calculates rate"
                sx={{ width: 135 }}
              />
              <TextField
                label="Disc %"
                type="number"
                size="small"
                fullWidth={false}
                value={line.discountPct}
                onChange={(e) => {
                  const discountPct = e.target.value;
                  const next = { ...line, discountPct };
                  setLine(index, line.amountDriven
                    ? { discountPct, rate: rateFromTotal(line.totalAmount, next) }
                    : { discountPct, totalAmount: totalFor(next) });
                }}
                sx={{ width: 85 }}
              />
              <TextField
                label="GST %"
                type="number"
                size="small"
                fullWidth={false}
                value={line.gstRate}
                onChange={(e) => {
                  const gstRate = e.target.value;
                  setLine(index, { gstRate });
                }}
                sx={{ width: 85 }}
              />
              <Typography variant="caption" sx={{ width: 120, textAlign: 'right' }}>
                Landing{' '}
                <strong>
                  {computed[index] && computed[index]!.qty > 0
                    ? money(
                        (computed[index]!.lineTotal + (shares[index] ?? 0)) / computed[index]!.qty,
                      )
                    : '—'}
                </strong>
              </Typography>
              <IconButton
                aria-label="Remove line"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                disabled={lines.length === 1}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}

          <Button
            startIcon={<AddIcon />}
            onClick={() => setLines((prev) => [...prev, { ...blankLine }])}
            sx={{ alignSelf: 'flex-start' }}
          >
            Add line
          </Button>

          <Divider />
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              label="Transport ₹"
              type="number"
              size="small"
              fullWidth={false}
              value={transportCharge}
              onChange={(e) => setTransportCharge(e.target.value)}
              sx={{ width: 140 }}
            />
            <TextField
              label="Other charges ₹"
              type="number"
              size="small"
              fullWidth={false}
              value={additionalCharge}
              onChange={(e) => setAdditionalCharge(e.target.value)}
              sx={{ width: 150 }}
            />
            <Stack direction="row" spacing={3} sx={{ ml: 'auto' }}>
              <Typography variant="body2" fontWeight={700}>
                Total boxes: {totalBoxes.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
              </Typography>
              <Typography variant="body2">Sub total: {money(totals.subTotal)}</Typography>
              <Typography variant="body2">GST: {money(totals.gstAmount)}</Typography>
              <Typography variant="subtitle2">Total: {money(totals.grandTotal)}</Typography>
            </Stack>
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
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={createInvoice.isPending || updateInvoice.isPending}
        >
          {createInvoice.isPending || updateInvoice.isPending ? 'Saving…' : 'Save draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
