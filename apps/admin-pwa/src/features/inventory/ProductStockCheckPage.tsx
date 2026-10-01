import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Divider,
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
  useTheme,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { formatBoxPieces } from '@tiles-erp/shared';
import type { ProductItem, StockCheckItem } from '@tiles-erp/shared-types';
import { LoadingOverlay, PageContainer } from '@tiles-erp/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useProducts } from '../products/api';
import { useProductStockCheck } from './api';

const quantity = (row: StockCheckItem, value: number): string =>
  formatBoxPieces(value, row.piecesPerBox, row.baseUom === 'PIECE');

/** Search one product and compare its stock position across every branch. */
export function ProductStockCheckPage(): JSX.Element {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<ProductItem | null>(null);
  const products = useProducts({ page: 1, pageSize: 100, search, sortOrder: 'asc' }, {});
  const stock = useProductStockCheck(product?.id ?? '');
  const stockByQuantity = useMemo(
    () => [...(stock.data ?? [])].sort((left, right) =>
      right.currentQtyBoxes - left.currentQtyBoxes
      || left.branchName.localeCompare(right.branchName)),
    [stock.data],
  );

  return (
    <PageContainer
      title="Product stock check"
      subtitle="Select a product to compare current and incoming stock across all branches."
    >
      <Stack spacing={{ xs: 1.25, sm: 1.5 }}>
        <Autocomplete
          options={products.data?.items ?? []}
          loading={products.isFetching}
          value={product}
          onChange={(_, value) => setProduct(value)}
          onInputChange={(_, value, reason) => { if (reason === 'input') setSearch(value); }}
          getOptionLabel={(option) => `${option.sku} · ${option.name}${option.sizeMm ? ` · ${option.sizeMm}` : ''}`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          renderInput={(params) => <TextField {...params} label="Search product by SKU or name" size={mobile ? 'medium' : 'small'} />}
          sx={{ width: '100%', maxWidth: 650 }}
        />

        {product && (
          <Typography variant="body2" color="text.secondary">
            {product.sku} · {product.name}{product.sizeMm ? ` · ${product.sizeMm}` : ''}
          </Typography>
        )}

        {stock.isFetching && <LoadingOverlay open />}
        {product && stock.isError && (
          <Alert severity="error">The branch stock could not be loaded.</Alert>
        )}
        {product && !stock.isFetching && !stock.isError && (stock.data?.length ?? 0) === 0 && (
          <Alert severity="info">No branch stock information is available for this product.</Alert>
        )}
        {product && !stock.isFetching && !stock.isError && (stock.data?.length ?? 0) > 0 && mobile && (
          <Stack spacing={1.25}>
            {stockByQuantity.map((row) => {
              const ownBranch = Boolean(user?.branchIds.includes(row.branchId));
              const values = [
                ['Current', quantity(row, row.currentQtyBoxes)],
                ['Hold', quantity(row, row.holdQtyBoxes)],
                ['Available', quantity(row, row.availableQtyBoxes)],
                ['PO', quantity(row, row.poQtyBoxes)],
                ['In-transit', quantity(row, row.inTransitQtyBoxes)],
                ['Expected', quantity(row, row.expectedQtyBoxes)],
              ];

              return (
                <Paper
                  key={row.branchId}
                  variant="outlined"
                  sx={{
                    overflow: 'hidden',
                    borderColor: ownBranch ? 'primary.main' : 'divider',
                    bgcolor: ownBranch ? 'action.hover' : 'background.paper',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ px: 1.5, py: 1.25 }}>
                    <Typography variant="subtitle2" fontWeight={800}>{row.branchName}</Typography>
                    {ownBranch && <Chip label="My branch" size="small" color="primary" />}
                  </Stack>
                  <Divider />
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 0,
                    }}
                  >
                    {values.map(([label, value], index) => (
                      <Box
                        key={label}
                        sx={{
                          minWidth: 0,
                          px: 1.5,
                          py: 1.1,
                          borderBottom: index < 4 ? 1 : 0,
                          borderRight: index % 2 === 0 ? 1 : 0,
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                        <Typography
                          variant="body2"
                          fontWeight={label === 'Available' || label === 'Expected' ? 800 : 600}
                          color={label === 'Available' ? 'success.main' : 'text.primary'}
                          sx={{ overflowWrap: 'anywhere' }}
                        >
                          {value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        )}
        {product && !stock.isFetching && !stock.isError && !mobile && (stock.data?.length ?? 0) > 0 && (
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 980 }}>
              <TableHead><TableRow>
                <TableCell>Branch</TableCell>
                <TableCell align="right">Current stock</TableCell>
                <TableCell align="right">Hold stock</TableCell>
                <TableCell align="right">Available stock</TableCell>
                <TableCell align="right">PO stock</TableCell>
                <TableCell align="right">In-transit stock</TableCell>
                <TableCell align="right">Expected stock</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {stockByQuantity.map((row) => {
                  const ownBranch = Boolean(user?.branchIds.includes(row.branchId));
                  return (
                    <TableRow key={row.branchId} sx={ownBranch ? { bgcolor: 'primary.50' } : undefined}>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <strong>{row.branchName}</strong>
                          {ownBranch && <Chip label="My branch" size="small" color="primary" variant="outlined" />}
                        </Stack>
                      </TableCell>
                      <TableCell align="right"><strong>{quantity(row, row.currentQtyBoxes)}</strong></TableCell>
                      <TableCell align="right">{quantity(row, row.holdQtyBoxes)}</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>{quantity(row, row.availableQtyBoxes)}</TableCell>
                      <TableCell align="right">{quantity(row, row.poQtyBoxes)}</TableCell>
                      <TableCell align="right">{quantity(row, row.inTransitQtyBoxes)}</TableCell>
                      <TableCell align="right"><strong>{quantity(row, row.expectedQtyBoxes)}</strong></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Stack>
    </PageContainer>
  );
}
