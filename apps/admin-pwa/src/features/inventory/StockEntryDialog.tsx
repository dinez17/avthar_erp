import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import type { OrgNodeItem, ProductItem, StockEntryLine } from '@tiles-erp/shared-types';
import { useSaveShortcut } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { usePostAdjustment, usePostOpeningStock } from './api';

type Mode = 'opening' | 'adjustment';

interface DraftLine {
  productId: string;
  godownId: string;
  batchNo: string;
  shade: string;
  qtyBoxes: string;
}

const blankLine: DraftLine = {
  productId: '',
  godownId: '',
  batchNo: '',
  shade: '',
  qtyBoxes: '',
};

interface StockEntryDialogProps {
  open: boolean;
  mode: Mode;
  branchId: string;
  godowns: OrgNodeItem[];
  products: ProductItem[];
  onClose: () => void;
}

/**
 * Multi-line entry for opening stock and adjustments. Both post through the same
 * movement engine; adjustments additionally require a reason and accept negatives.
 */
export function StockEntryDialog({
  open,
  mode,
  branchId,
  godowns,
  products,
  onClose,
}: StockEntryDialogProps): JSX.Element {
  const postOpening = usePostOpeningStock();
  const postAdjustment = usePostAdjustment();
  const [lines, setLines] = useState<DraftLine[]>([blankLine]);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const isAdjustment = mode === 'adjustment';
  const pending = postOpening.isPending || postAdjustment.isPending;

  const setLine = (index: number, patch: Partial<DraftLine>): void => {
    setDone(null);
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const reset = (): void => {
    setLines([blankLine]);
    setReason('');
    setRemarks('');
    setError(null);
    setDone(null);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setDone(null);

    const payloadLines: StockEntryLine[] = [];
    for (const line of lines) {
      if (!line.productId && !line.qtyBoxes) continue;
      if (!line.productId || !line.godownId) {
        setError('Every line needs a product and a godown');
        return;
      }
      const qty = Number(line.qtyBoxes);
      if (!Number.isFinite(qty) || qty === 0) {
        setError('Every line needs a non-zero quantity');
        return;
      }
      if (!isAdjustment && qty < 0) {
        setError('Opening stock quantities must be positive');
        return;
      }
      payloadLines.push({
        productId: line.productId,
        godownId: line.godownId,
        batchNo: line.batchNo || null,
        shade: line.shade || null,
        qtyBoxes: qty,
      });
    }
    if (payloadLines.length === 0) {
      setError('Add at least one line');
      return;
    }

    try {
      const result = isAdjustment
        ? await postAdjustment.mutateAsync({
            branchId,
            reason,
            remarks: remarks || undefined,
            lines: payloadLines,
          })
        : await postOpening.mutateAsync({
            branchId,
            remarks: remarks || undefined,
            lines: payloadLines,
          });
      setDone(result.posted);
      setLines([blankLine]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post');
    }
  };

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void submit(), open);

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{isAdjustment ? 'Stock adjustment' : 'Opening stock'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {done !== null && <Alert severity="success">Posted {done} movement(s).</Alert>}
          <Typography variant="caption" color="text.secondary">
            {isAdjustment
              ? 'Use negative quantities to reduce stock. Every posting is recorded in the ledger.'
              : 'Opening stock can be declared once per product and godown; later corrections go through adjustments.'}
          </Typography>

          {isAdjustment && (
            <TextField
              label="Reason *"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Physical count correction, damage, breakage…"
            />
          )}

          {lines.map((line, index) => (
            <Stack key={index} direction="row" spacing={1} alignItems="center">
              <TextField
                select
                label="Product"
                size="small"
                fullWidth={false}
                value={line.productId}
                onChange={(e) => setLine(index, { productId: e.target.value })}
                sx={{ width: 260 }}
              >
                {products.map((product) => (
                  <MenuItem key={product.id} value={product.id}>
                    {product.sku} — {product.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Godown"
                size="small"
                fullWidth={false}
                value={line.godownId}
                onChange={(e) => setLine(index, { godownId: e.target.value })}
                sx={{ width: 170 }}
              >
                {godowns.map((godown) => (
                  <MenuItem key={godown.id} value={godown.id}>
                    {godown.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Batch"
                size="small"
                fullWidth={false}
                value={line.batchNo}
                onChange={(e) => setLine(index, { batchNo: e.target.value })}
                sx={{ width: 110 }}
              />
              <TextField
                label="Shade"
                size="small"
                fullWidth={false}
                value={line.shade}
                onChange={(e) => setLine(index, { shade: e.target.value })}
                sx={{ width: 110 }}
              />
              <TextField
                label="Boxes"
                type="number"
                size="small"
                fullWidth={false}
                value={line.qtyBoxes}
                onChange={(e) => setLine(index, { qtyBoxes: e.target.value })}
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
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
          color="inherit"
        >
          Close
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={pending}>
          {pending ? 'Posting…' : 'Post'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
