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
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
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
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
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
      fullScreen={mobile}
    >
      <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 }, fontSize: { xs: 20, sm: 22 } }}>
        {isAdjustment ? 'Stock adjustment' : 'Opening stock'}
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 }, pb: { xs: 11, sm: 2 } }}>
        <Stack spacing={{ xs: 2, sm: 1.5 }} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {done !== null && <Alert severity="success">Posted {done} movement(s).</Alert>}
          <Alert severity="info" icon={false} sx={{ fontSize: { xs: 14, sm: 12 } }}>
            {isAdjustment
              ? 'Use negative quantities to reduce stock. Every posting is recorded in the ledger.'
              : 'Opening stock can be declared once per product and godown; later corrections go through adjustments.'}
          </Alert>

          {isAdjustment && (
            <TextField
              label="Reason *"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Physical count correction, damage, breakage…"
              sx={{ '& .MuiInputBase-root': { minHeight: { xs: 52, sm: 'auto' }, fontSize: { xs: 16, sm: 14 } } }}
            />
          )}

          {lines.map((line, index) => {
            const selectedProduct = products.find((product) => product.id === line.productId) ?? null;
            return (
            <Box key={index}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', sm: 'flex' } }}>
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
            <Paper variant="outlined" sx={{ display: { xs: 'block', sm: 'none' }, p: 1.5, borderRadius: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle1" fontWeight={700}>Stock line {index + 1}</Typography>
                  <IconButton
                    color="error"
                    aria-label={`Remove stock line ${index + 1}`}
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    disabled={lines.length === 1}
                    sx={{ minWidth: 44, minHeight: 44 }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Stack>
                <Autocomplete
                  options={products}
                  value={selectedProduct}
                  getOptionLabel={(product) => `${product.sku} — ${product.name}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  onChange={(_, value) => setLine(index, { productId: value?.id ?? '' })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Product *"
                      placeholder="Search product or SKU"
                      sx={{ '& .MuiInputBase-root': { minHeight: 52, fontSize: 16 } }}
                    />
                  )}
                />
                <TextField
                  select
                  label="Godown *"
                  value={line.godownId}
                  onChange={(event) => setLine(index, { godownId: event.target.value })}
                  sx={{ '& .MuiInputBase-root': { minHeight: 52, fontSize: 16 } }}
                >
                  {godowns.map((godown) => (
                    <MenuItem key={godown.id} value={godown.id}>{godown.name}</MenuItem>
                  ))}
                </TextField>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
                  <TextField
                    label="Batch"
                    value={line.batchNo}
                    onChange={(event) => setLine(index, { batchNo: event.target.value })}
                    sx={{ '& .MuiInputBase-root': { minHeight: 52, fontSize: 16 } }}
                  />
                  <TextField
                    label="Shade"
                    value={line.shade}
                    onChange={(event) => setLine(index, { shade: event.target.value })}
                    sx={{ '& .MuiInputBase-root': { minHeight: 52, fontSize: 16 } }}
                  />
                </Box>
                <TextField
                  label={isAdjustment ? 'Adjustment boxes *' : 'Opening boxes *'}
                  type="number"
                  value={line.qtyBoxes}
                  onChange={(event) => setLine(index, { qtyBoxes: event.target.value })}
                  helperText={isAdjustment ? 'Use a negative value to reduce stock' : undefined}
                  inputProps={{ inputMode: 'decimal' }}
                  sx={{ '& .MuiInputBase-root': { minHeight: 52, fontSize: 16 } }}
                />
              </Stack>
            </Paper>
            </Box>
          );})}

          <Button
            startIcon={<AddIcon />}
            onClick={() => setLines((prev) => [...prev, blankLine])}
            variant="outlined"
            sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, minHeight: { xs: 48, sm: 'auto' }, fontSize: { xs: 15, sm: 'inherit' } }}
          >
            Add line
          </Button>

          <TextField
            label="Remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            multiline
            minRows={2}
            sx={{ '& .MuiInputBase-root': { fontSize: { xs: 16, sm: 14 } } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ position: { xs: 'fixed', sm: 'static' }, left: 0, right: 0, bottom: 0, zIndex: 2, bgcolor: 'background.paper', borderTop: { xs: 1, sm: 0 }, borderColor: 'divider', p: { xs: 1, sm: 2 }, pb: { xs: 'max(8px, env(safe-area-inset-bottom))', sm: 2 } }}>
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
          color="inherit"
          variant={mobile ? 'outlined' : 'text'}
          sx={{ flex: { xs: 1, sm: 'initial' }, minHeight: { xs: 48, sm: 'auto' } }}
        >
          Close
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={pending} sx={{ flex: { xs: 1, sm: 'initial' }, minHeight: { xs: 48, sm: 'auto' } }}>
          {pending ? 'Posting…' : 'Post'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
