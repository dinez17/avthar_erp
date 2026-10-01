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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConvertLeadInput, LeadItem } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { useProducts } from '../products/api';
import { useBranches } from '../products/branch-prices-api';
import { useConvertLead } from './api';

interface LineRow {
  productId: string;
  boxes: string;
  rate: string;
}

const emptyRow: LineRow = { productId: '', boxes: '1', rate: '' };

interface Props {
  open: boolean;
  lead: LeadItem | null;
  onClose: () => void;
  onConverted: (message: string) => void;
}

/**
 * Turns a lead into a draft quotation: pick the products the customer wants, and the
 * quotation desk prices them at the branch. On success the new draft opens for final edits.
 */
export function ConvertLeadDialog({ open, lead, onClose, onConverted }: Props): JSX.Element {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const products = useProducts({ page: 1, pageSize: 200, sortOrder: 'asc' }, {});
  const branches = useBranches();
  const convert = useConvertLead();

  const [branchId, setBranchId] = useState('');
  const [rows, setRows] = useState<LineRow[]>([{ ...emptyRow }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBranchId(lead?.branchId ?? '');
      setRows([{ ...emptyRow }]);
      setError(null);
    }
  }, [open, lead]);

  const productOptions = useMemo(() => products.data?.items ?? [], [products.data]);

  const setRow = (index: number, patch: Partial<LineRow>): void =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addRow = (): void => setRows((prev) => [...prev, { ...emptyRow }]);
  const removeRow = (index: number): void =>
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const submit = async (): Promise<void> => {
    setError(null);
    if (!lead) return;
    if (!branchId) {
      setError('Choose a branch to quote from');
      return;
    }
    const lines = rows
      .filter((row) => row.productId)
      .map((row) => ({
        productId: row.productId,
        boxes: row.boxes ? Number(row.boxes) : 0,
        rate: row.rate ? Number(row.rate) : 0,
      }));
    if (lines.length === 0) {
      setError('Add at least one product to quote');
      return;
    }

    const payload: ConvertLeadInput & { id: string } = { id: lead.id, branchId, lines };
    try {
      const result = await convert.mutateAsync(payload);
      onConverted(
        `${lead.code} converted — ${result.quotation.quotationNumber} created as a draft.`,
      );
      onClose();
      // Open the fresh draft so the salesperson can finalise it.
      navigate(`/quotations/${result.quotation.id}/edit`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={mobile}>
      <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 }, fontSize: { xs: 20, sm: 22 } }}>
        Convert {lead?.code} to a quotation
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 }, pb: { xs: 11, sm: 2 } }}>
        <Stack spacing={{ xs: 2, sm: 1.5 }} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Typography variant="body1" fontWeight={600}>
            Quoting for {lead?.companyName || lead?.name}
            {lead?.phone ? ` · ${lead.phone}` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Leave a rate blank to use the branch selling price.
          </Typography>
          </Paper>
          <TextField
            select
            label="Branch *"
            size={mobile ? 'medium' : 'small'}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            fullWidth={mobile}
            sx={{ width: { xs: '100%', sm: 260 }, '& .MuiInputBase-root': { minHeight: { xs: 50, sm: 'auto' }, fontSize: { xs: 16, sm: 14 } } }}
            helperText={lead?.branchId ? "The lead's branch" : 'This lead has no branch yet'}
          >
            <MenuItem value="">Choose a branch</MenuItem>
            {(branches.data ?? []).map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>

          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>
                  Boxes
                </TableCell>
                <TableCell align="right" sx={{ width: 140 }}>
                  Rate (optional)
                </TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={row.productId}
                      onChange={(e) => setRow(index, { productId: e.target.value })}
                    >
                      <MenuItem value="">Select a product…</MenuItem>
                      {productOptions.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.sku} · {p.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={row.boxes}
                      onChange={(e) => setRow(index, { boxes: e.target.value })}
                      inputProps={{ min: 0, style: { textAlign: 'right' } }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={row.rate}
                      onChange={(e) => setRow(index, { rate: e.target.value })}
                      inputProps={{ min: 0, style: { textAlign: 'right' } }}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeRow(index)}
                      disabled={rows.length === 1}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </Box>

          <Stack spacing={1.5} sx={{ display: { xs: 'flex', sm: 'none' } }}>
            {rows.map((row, index) => {
              const selectedProduct = productOptions.find((product) => product.id === row.productId) ?? null;
              return (
                <Paper key={index} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle1" fontWeight={700}>Product {index + 1}</Typography>
                      <IconButton
                        color="error"
                        aria-label={`Remove product ${index + 1}`}
                        onClick={() => removeRow(index)}
                        disabled={rows.length === 1}
                        sx={{ minWidth: 44, minHeight: 44 }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Stack>
                    <Autocomplete
                      options={productOptions}
                      value={selectedProduct}
                      getOptionLabel={(product) => `${product.sku} · ${product.name}`}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      onChange={(_, value) => setRow(index, { productId: value?.id ?? '' })}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Product *"
                          placeholder="Search product or SKU"
                          sx={{ '& .MuiInputBase-root': { minHeight: 52, fontSize: 16 } }}
                        />
                      )}
                    />
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
                      <TextField
                        label="Boxes"
                        type="number"
                        value={row.boxes}
                        onChange={(event) => setRow(index, { boxes: event.target.value })}
                        inputProps={{ min: 0, inputMode: 'decimal' }}
                        sx={{ '& .MuiInputBase-root': { minHeight: 52, fontSize: 16 } }}
                      />
                      <TextField
                        label="Rate (optional)"
                        type="number"
                        value={row.rate}
                        onChange={(event) => setRow(index, { rate: event.target.value })}
                        inputProps={{ min: 0, inputMode: 'decimal' }}
                        sx={{ '& .MuiInputBase-root': { minHeight: 52, fontSize: 16 } }}
                      />
                    </Box>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={addRow}
            sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, minHeight: { xs: 48, sm: 'auto' }, fontSize: { xs: 15, sm: 'inherit' } }}
          >
            Add product
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ position: { xs: 'fixed', sm: 'static' }, left: 0, right: 0, bottom: 0, zIndex: 2, bgcolor: 'background.paper', borderTop: { xs: 1, sm: 0 }, borderColor: 'divider', p: { xs: 1, sm: 2 }, pb: { xs: 'max(8px, env(safe-area-inset-bottom))', sm: 2 } }}>
        <Button color="inherit" variant={mobile ? 'outlined' : 'text'} onClick={onClose} sx={{ flex: { xs: 1, sm: 'initial' }, minHeight: { xs: 48, sm: 'auto' } }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={convert.isPending} sx={{ flex: { xs: 1, sm: 'initial' }, minHeight: { xs: 48, sm: 'auto' } }}>
          {convert.isPending ? 'Converting…' : 'Create quotation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
