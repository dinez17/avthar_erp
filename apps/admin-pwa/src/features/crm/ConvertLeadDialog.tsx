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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Convert {lead?.code} to a quotation</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            Quoting for {lead?.companyName || lead?.name}
            {lead?.phone ? ` · ${lead.phone}` : ''}. Leave a rate blank to use the branch
            selling price.
          </Typography>
          <TextField
            select
            label="Branch *"
            size="small"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            sx={{ width: 260 }}
            helperText={lead?.branchId ? "The lead's branch" : 'This lead has no branch yet'}
          >
            <MenuItem value="">Choose a branch</MenuItem>
            {(branches.data ?? []).map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>

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
          <Button startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: 'flex-start' }}>
            Add product
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={convert.isPending}>
          {convert.isPending ? 'Converting…' : 'Create quotation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
