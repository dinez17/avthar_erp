import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
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
import { useState } from 'react';
import { PageContainer } from '@tiles-erp/ui';
import type { SupplierPortalProduct } from '@tiles-erp/shared-types';
import { ApiError } from '../lib/api-client';
import { SupplierSwitcher, usePortal } from '../portal/PortalProvider';
import {
  useProductPoStock,
  useRaiseSupplierPo,
  useSupplierBranches,
  useSupplierProducts,
} from '../portal/api';

interface PoLine {
  productId: string;
  boxes: string;
  rate: string;
}

const emptyLine: PoLine = { productId: '', boxes: '', rate: '' };

export function ProductsPage(): JSX.Element {
  const { activeSupplierId } = usePortal();
  const { data: products } = useSupplierProducts(activeSupplierId);
  const branches = useSupplierBranches(activeSupplierId);
  const raisePo = useRaiseSupplierPo(activeSupplierId);

  const [poStockProduct, setPoStockProduct] = useState<SupplierPortalProduct | null>(null);
  const poStock = useProductPoStock(activeSupplierId, poStockProduct?.productId ?? null);

  const [raiseOpen, setRaiseOpen] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [lines, setLines] = useState<PoLine[]>([{ ...emptyLine }]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productList = products ?? [];

  const setLine = (index: number, patch: Partial<PoLine>): void =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const openRaise = (productId?: string): void => {
    const seed: PoLine = productId
      ? {
          productId,
          boxes: '',
          rate: String(productList.find((p) => p.productId === productId)?.defaultRate ?? ''),
        }
      : { ...emptyLine };
    setLines([seed]);
    setBranchId('');
    setExpectedDate('');
    setError(null);
    setRaiseOpen(true);
  };

  const submitRaise = async (): Promise<void> => {
    setError(null);
    if (!branchId) return setError('Choose a branch');
    const cleaned = lines
      .filter((line) => line.productId && Number(line.boxes) > 0)
      .map((line) => ({
        productId: line.productId,
        boxes: Number(line.boxes),
        rate: line.rate ? Number(line.rate) : 0,
      }));
    if (cleaned.length === 0) return setError('Add at least one product with a quantity');
    try {
      const order = await raisePo.mutateAsync({
        branchId,
        expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
        lines: cleaned,
      });
      setRaiseOpen(false);
      setNotice(`Draft order ${order.poNumber} raised — awaiting the company's approval.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <PageContainer
      title="Products & stock"
      subtitle="Your products, the company's stock on hand, and what's on order"
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          <SupplierSwitcher />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openRaise()}>
            Raise order
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        {notice && (
          <Alert severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>SKU</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Size</TableCell>
              <TableCell align="right">Current stock</TableCell>
              <TableCell align="right">On order (PO)</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {productList.map((product) => (
              <TableRow key={product.productId} hover>
                <TableCell>{product.sku}</TableCell>
                <TableCell>{product.name}</TableCell>
                <TableCell>{product.sizeMm ?? '—'}</TableCell>
                <TableCell align="right">{product.currentStock} box</TableCell>
                <TableCell align="right">
                  {product.poStock > 0 ? (
                    <Link
                      component="button"
                      underline="hover"
                      onClick={() => setPoStockProduct(product)}
                    >
                      {product.poStock} box ({product.poCount})
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openRaise(product.productId)}>
                    Raise
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {productList.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary">
                    No products are linked to your account yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>

      <Dialog
        open={poStockProduct !== null}
        onClose={() => setPoStockProduct(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>On order · {poStockProduct?.name}</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>PO number</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Pending</TableCell>
                <TableCell>Expected</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(poStock.data ?? []).map((line) => (
                <TableRow key={line.poId}>
                  <TableCell>{line.poNumber}</TableCell>
                  <TableCell>
                    <Chip label={line.status.replace('_', ' ')} size="small" />
                  </TableCell>
                  <TableCell align="right">{line.pendingBoxes} box</TableCell>
                  <TableCell>
                    {line.expectedDate ? new Date(line.expectedDate).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {(poStock.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">
                      Nothing on order.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPoStockProduct(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={raiseOpen} onClose={() => setRaiseOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Raise a purchase order</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              This creates a draft order for the company to review and approve.
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField
                select
                label="Branch *"
                size="small"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                sx={{ minWidth: 220 }}
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
                InputLabelProps={{ shrink: true }}
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell align="right" sx={{ width: 110 }}>
                    Boxes
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    Rate
                  </TableCell>
                  <TableCell sx={{ width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={line.productId}
                        onChange={(e) => {
                          const product = productList.find((p) => p.productId === e.target.value);
                          setLine(index, {
                            productId: e.target.value,
                            rate: line.rate || String(product?.defaultRate ?? ''),
                          });
                        }}
                      >
                        <MenuItem value="">Select…</MenuItem>
                        {productList.map((p) => (
                          <MenuItem key={p.productId} value={p.productId}>
                            {p.sku} · {p.name}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        value={line.boxes}
                        onChange={(e) => setLine(index, { boxes: e.target.value })}
                        inputProps={{ min: 0, style: { textAlign: 'right' } }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small"
                        type="number"
                        value={line.rate}
                        onChange={(e) => setLine(index, { rate: e.target.value })}
                        inputProps={{ min: 0, style: { textAlign: 'right' } }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() =>
                          setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
                        }
                        disabled={lines.length === 1}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add product
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRaiseOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void submitRaise()} disabled={raisePo.isPending}>
            {raisePo.isPending ? 'Raising…' : 'Raise order'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
