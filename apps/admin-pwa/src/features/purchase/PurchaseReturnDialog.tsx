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
import { calculatePurchaseLine, splitBoxesPieces, sumPurchaseTotals } from '@tiles-erp/shared';
import type { PurchaseReturnLineInput } from '@tiles-erp/shared-types';
import { useSaveShortcut } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { useGodowns, useStockBalances } from '../inventory/api';
import { useBranches } from '../products/branch-prices-api';
import { useSuppliers } from './api';
import { useCreatePurchaseReturn } from './returns-api';

interface DraftLine {
  /** productId|batch|shade, identifying the stock being returned. */
  stockKey: string;
  qtyBoxes: string;
  rate: string;
}

const blankLine: DraftLine = { stockKey: '', qtyBoxes: '', rate: '' };

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PurchaseReturnDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (returnNumber: string) => void;
}

/** Drafts a return of goods to a supplier, picking from stock actually held. */
export function PurchaseReturnDialog({
  open,
  onClose,
  onSaved,
}: PurchaseReturnDialogProps): JSX.Element {
  const suppliers = useSuppliers();
  const branches = useBranches();
  const createReturn = useCreatePurchaseReturn();

  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [godownId, setGodownId] = useState('');
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine]);
  const [error, setError] = useState<string | null>(null);

  const godowns = useGodowns(branchId || undefined);
  const stock = useStockBalances(
    { page: 1, pageSize: 200, sortOrder: 'asc' },
    { branchId: branchId || undefined, godownId: godownId || undefined },
    Boolean(branchId && godownId),
  );

  useEffect(() => {
    if (open) return;
    setSupplierId('');
    setBranchId('');
    setGodownId('');
    setReason('');
    setRemarks('');
    setLines([blankLine]);
    setError(null);
  }, [open]);

  const available = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        qtyBoxes: number;
        piecesPerBox: number;
        productId: string;
        batchNo: string | null;
        shade: string | null;
      }
    >();
    for (const item of stock.data?.items ?? []) {
      if (item.qtyBoxes <= 0) continue;
      const key = `${item.productId}|${item.batchNo ?? ''}|${item.shade ?? ''}`;
      const dims = [item.batchNo, item.shade].filter(Boolean).join(' / ');
      const split = splitBoxesPieces(item.qtyBoxes, item.piecesPerBox);
      const onHand =
        item.baseUom === 'PIECE'
          ? `${Math.round(item.qtyPieces)} pcs`
          : `${split.boxes} box${split.pieces ? ` ${split.pieces} pcs` : ''}`;
      map.set(key, {
        label: `${item.sku} — ${item.productName}${dims ? ` (${dims})` : ''} · ${onHand}`,
        qtyBoxes: item.qtyBoxes,
        piecesPerBox: item.piecesPerBox,
        productId: item.productId,
        batchNo: item.batchNo,
        shade: item.shade,
      });
    }
    return map;
  }, [stock.data]);

  const computed = lines.map((line) =>
    calculatePurchaseLine(Number(line.qtyBoxes || 0), Number(line.rate || 0), 0, 0),
  );
  const totals = sumPurchaseTotals(computed);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!supplierId || !branchId || !godownId) {
      setError('Choose the supplier, branch and godown');
      return;
    }
    if (!reason.trim()) {
      setError('Enter a reason for the return');
      return;
    }

    const payload: PurchaseReturnLineInput[] = [];
    for (const line of lines) {
      if (!line.stockKey) continue;
      const source = available.get(line.stockKey);
      if (!source) continue;
      const qtyBoxes = Number(line.qtyBoxes || 0);
      if (qtyBoxes <= 0) {
        setError('Every line needs a quantity greater than zero');
        return;
      }
      if (qtyBoxes > source.qtyBoxes) {
        setError(`Only ${source.qtyBoxes} boxes in stock for ${source.label.split(' — ')[0]}`);
        return;
      }
      payload.push({
        productId: source.productId,
        batchNo: source.batchNo,
        shade: source.shade,
        qtyBoxes,
        rate: Number(line.rate || 0),
      });
    }
    if (payload.length === 0) {
      setError('Add at least one line');
      return;
    }

    try {
      const result = await createReturn.mutateAsync({
        supplierId,
        branchId,
        godownId,
        reason: reason.trim(),
        remarks: remarks || undefined,
        lines: payload,
      });
      onSaved(result.returnNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the return');
    }
  };

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>New purchase return</DialogTitle>
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
              sx={{ width: 210 }}
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
              onChange={(e) => {
                setBranchId(e.target.value);
                setGodownId('');
                setLines([blankLine]);
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
              label="From godown *"
              size="small"
              fullWidth={false}
              value={godownId}
              onChange={(e) => {
                setGodownId(e.target.value);
                setLines([blankLine]);
              }}
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
              label="Reason *"
              size="small"
              fullWidth={false}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged, wrong shade, excess…"
              sx={{ width: 230 }}
            />
          </Stack>

          <Divider />
          <Typography variant="subtitle2">Items</Typography>

          {!godownId ? (
            <Alert severity="info">Choose the godown to list the stock available to return.</Alert>
          ) : (
            <>
              {lines.map((line, index) => (
                <Stack key={index} direction="row" spacing={1} alignItems="center">
                  <TextField
                    select
                    label="Item"
                    size="small"
                    fullWidth={false}
                    value={line.stockKey}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, stockKey: e.target.value } : l)),
                      )
                    }
                    sx={{ width: 400 }}
                  >
                    {[...available.entries()].map(([key, item]) => (
                      <MenuItem key={key} value={key}>
                        {item.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Boxes"
                    type="number"
                    size="small"
                    fullWidth={false}
                    value={line.qtyBoxes}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, qtyBoxes: e.target.value } : l)),
                      )
                    }
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="Rate ₹"
                    type="number"
                    size="small"
                    fullWidth={false}
                    value={line.rate}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, rate: e.target.value } : l)),
                      )
                    }
                    sx={{ width: 110 }}
                  />
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
                onClick={() => setLines((prev) => [...prev, blankLine])}
                sx={{ alignSelf: 'flex-start' }}
              >
                Add line
              </Button>
            </>
          )}

          <Divider />
          <Typography variant="subtitle2" sx={{ textAlign: 'right' }}>
            Goods value: {money(totals.subTotal)} (GST added on save)
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
        <Button variant="contained" onClick={() => void submit()} disabled={createReturn.isPending}>
          {createReturn.isPending ? 'Saving…' : 'Save draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
