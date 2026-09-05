import { zodResolver } from '@hookform/resolvers/zod';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePagination } from '@tiles-erp/hooks';
import { ConfirmDialog, PageContainer, useSaveShortcut } from '@tiles-erp/ui';
import type { ProductItem, ProductUom } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { ApiError } from '../../lib/api-client';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { PERMISSIONS } from '@tiles-erp/config';
import { useAuth } from '../../auth/AuthProvider';
import { SyncStatusChip } from '../sixorbit/SyncStatusChip';
import { usePushPendingProducts, usePushProductToSixOrbit } from '../sixorbit/api';
import { useCatalogOptions } from '../catalog/api';
import { ProductFilterBar } from './ProductFilterBar';
import type { ProductFilters } from './api';
import { useCreateProduct, useDeleteProduct, useProducts, useUpdateProduct } from './api';

const productFormSchema = z.object({
  sku: z.string().trim().min(2, 'At least 2 characters').max(64),
  name: z.string().trim().min(2, 'At least 2 characters').max(200),
  description: z.string().trim().max(1000),
  categoryId: z.string().min(1, 'Category is required'),
  brandId: z.string().min(1, 'Brand is required'),
  seriesId: z.string(),
  collectionId: z.string(),
  sizeMm: z.string().trim().max(32),
  piecesPerBox: z.coerce.number().int('Whole number').min(1, 'At least 1'),
  sqftPerBox: z.coerce.number().positive('Must be greater than 0'),
  baseUom: z.enum(['BOX', 'PIECE', 'SQFT']),
  hsnCode: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, 'HSN must be 4-8 digits'),
  gstRate: z.coerce.number().min(0).max(28, 'Max 28%'),
  mrp: z.coerce.number().min(0).optional().or(z.literal('')),
  sellingRate: z.coerce.number().min(0).optional().or(z.literal('')),
  barcode: z.string().trim().max(64),
  reorderLevelBoxes: z.coerce.number().min(0).optional().or(z.literal('')),
  isActive: z.boolean(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

const emptyValues: ProductFormValues = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  brandId: '',
  seriesId: '',
  collectionId: '',
  sizeMm: '',
  piecesPerBox: 1,
  sqftPerBox: 1,
  baseUom: 'BOX',
  hsnCode: '',
  gstRate: 18,
  mrp: '',
  sellingRate: '',
  barcode: '',
  reorderLevelBoxes: '',
  isActive: true,
};

const numberOrNull = (value: number | '' | undefined): number | null =>
  value === '' || value === undefined ? null : value;

export function ProductsPage(): JSX.Element {
  const pagination = usePagination();
  const [filters, setFilters] = useState<ProductFilters>({});
  const { data, isFetching } = useProducts(pagination.query, filters);
  const { hasPermission } = useAuth();
  const canSync = hasPermission(PERMISSIONS.SIXORBIT_SYNC);
  const pushProduct = usePushProductToSixOrbit();
  const [pushOutcome, setPushOutcome] = useState<{
    severity: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  /**
   * Push one product and say what came back.
   *
   * A button that reports "queued" and leaves the row unchanged is indistinguishable from
   * a button that does nothing, which is exactly how this went wrong the first time.
   */
  const pushOne = async (product: ProductItem): Promise<void> => {
    setPushOutcome(null);
    try {
      const result = await pushProduct.mutateAsync(product.id);
      if (result.operation === 'blocked') {
        setPushOutcome({
          severity: 'warning',
          text: `${product.sku}: ${result.reason ?? 'blocked'}`,
        });
      } else {
        setPushOutcome({
          severity: 'success',
          text: `${product.sku} ${result.operation === 'create' ? 'created in' : 'updated in'} SixOrbit${result.adopted ? ' (matched an existing item)' : ''}.`,
        });
      }
    } catch (err) {
      setPushOutcome({
        severity: 'error',
        text: `${product.sku}: ${err instanceof ApiError ? err.message : 'the push failed'}`,
      });
    }
  };
  const pushPending = usePushPendingProducts();

  const categories = useCatalogOptions('/categories');
  const brands = useCatalogOptions('/brands');
  const series = useCatalogOptions('/series');
  const collections = useCatalogOptions('/collections');
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [deleting, setDeleting] = useState<ProductItem | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: emptyValues,
  });

  const watchBrand = form.watch('brandId');
  const watchPieces = form.watch('piecesPerBox');
  const watchSqft = form.watch('sqftPerBox');
  const sqftPerPiece =
    Number(watchPieces) > 0 ? (Number(watchSqft) / Number(watchPieces)).toFixed(4) : '—';

  const brandSeries = (series.data ?? []).filter((s) => s.parentId === watchBrand);
  const brandCollections = (collections.data ?? []).filter((c) => c.parentId === watchBrand);

  const openCreate = (): void => {
    setEditing(null);
    setServerError(null);
    form.reset(emptyValues);
    setDialogOpen(true);
  };

  const openEdit = (product: ProductItem): void => {
    setEditing(product);
    setServerError(null);
    form.reset({
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      categoryId: product.categoryId,
      brandId: product.brandId,
      seriesId: product.seriesId ?? '',
      collectionId: product.collectionId ?? '',
      sizeMm: product.sizeMm ?? '',
      piecesPerBox: product.piecesPerBox,
      sqftPerBox: product.sqftPerBox,
      baseUom: product.baseUom,
      hsnCode: product.hsnCode,
      gstRate: product.gstRate,
      mrp: product.mrp ?? '',
      sellingRate: product.sellingRate ?? '',
      barcode: product.barcode ?? '',
      reorderLevelBoxes: product.reorderLevelBoxes ?? '',
      isActive: product.isActive,
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const common = {
        sku: values.sku,
        name: values.name,
        description: values.description || null,
        categoryId: values.categoryId,
        brandId: values.brandId,
        seriesId: values.seriesId || null,
        collectionId: values.collectionId || null,
        sizeMm: values.sizeMm || null,
        piecesPerBox: values.piecesPerBox,
        sqftPerBox: values.sqftPerBox,
        baseUom: values.baseUom as ProductUom,
        hsnCode: values.hsnCode,
        gstRate: values.gstRate,
        mrp: numberOrNull(values.mrp),
        sellingRate: numberOrNull(values.sellingRate),
        barcode: values.barcode || null,
        reorderLevelBoxes: numberOrNull(values.reorderLevelBoxes),
        isActive: values.isActive,
      };
      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, ...common, version: editing.version });
      } else {
        await createProduct.mutateAsync({
          ...common,
          description: values.description || undefined,
          seriesId: values.seriesId || undefined,
          collectionId: values.collectionId || undefined,
          sizeMm: values.sizeMm || undefined,
          mrp: numberOrNull(values.mrp) ?? undefined,
          sellingRate: numberOrNull(values.sellingRate) ?? undefined,
          barcode: values.barcode || undefined,
          reorderLevelBoxes: numberOrNull(values.reorderLevelBoxes) ?? undefined,
        });
      }
      setDialogOpen(false);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong');
    }
  });

  const columns = useMemo<ColDef<ProductItem>[]>(
    () => [
      { field: 'sku', headerName: 'SKU', minWidth: 160 },
      { field: 'name', headerName: 'Name', minWidth: 220 },
      { field: 'brandName', headerName: 'Brand', minWidth: 130 },
      { field: 'categoryName', headerName: 'Category', minWidth: 130 },
      { field: 'sizeMm', headerName: 'Size', maxWidth: 110 },
      { field: 'piecesPerBox', headerName: 'Pcs/Box', maxWidth: 100 },
      { field: 'sqftPerBox', headerName: 'Sqft/Box', maxWidth: 110 },
      {
        field: 'gstRate',
        headerName: 'GST',
        maxWidth: 90,
        valueFormatter: (p) => (p.value !== undefined ? `${p.value}%` : ''),
      },
      {
        field: 'isActive',
        headerName: 'Status',
        maxWidth: 110,
        cellRenderer: (p: ICellRendererParams<ProductItem>) => (
          <Chip
            label={p.data?.isActive ? 'Active' : 'Inactive'}
            color={p.data?.isActive ? 'success' : 'default'}
            size="small"
          />
        ),
      },
      {
        field: 'sixorbitSyncStatus',
        headerName: 'SixOrbit',
        maxWidth: 130,
        cellRenderer: (p: ICellRendererParams<ProductItem>) => (
          <SyncStatusChip
            status={p.data?.sixorbitSyncStatus ?? null}
            error={p.data?.sixorbitSyncError}
          />
        ),
      },
      {
        headerName: '',
        maxWidth: 150,
        cellRenderer: (p: ICellRendererParams<ProductItem>) => (
          <>
            <Tooltip title="Push to SixOrbit">
              <span>
                <IconButton
                  size="small"
                  aria-label="Push to SixOrbit"
                  disabled={!canSync || pushProduct.isPending}
                  onClick={() => p.data && void pushOne(p.data)}
                >
                  <CloudUploadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton size="small" aria-label="Edit" onClick={() => p.data && openEdit(p.data)}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Delete"
              onClick={() => p.data && setDeleting(p.data)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </>
        ),
      },
    ],
    [canSync, pushProduct],
  );

  // Ctrl+S saves without reaching for the mouse.
  useSaveShortcut(() => void onSubmit(), dialogOpen);

  return (
    <PageContainer
      title="Products"
      subtitle="Product master with UOM, HSN, GST and catalog references."
      actions={
        <Stack direction="row" spacing={1}>
          {canSync && (
            <Button
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              disabled={pushPending.isPending}
              onClick={() => void pushPending.mutateAsync()}
            >
              {pushPending.isPending ? 'Queueing…' : 'Push pending to SixOrbit'}
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New product
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1}>
        {pushOutcome && (
          <Alert severity={pushOutcome.severity} onClose={() => setPushOutcome(null)}>
            {pushOutcome.text}
          </Alert>
        )}
        <ProductFilterBar
          value={filters}
          showSeries
          onChange={(next) => {
            setFilters(next);
            pagination.setPage(1);
          }}
        />
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          meta={data?.meta}
          pagination={pagination}
          loading={isFetching}
          searchPlaceholder="Search by name, SKU, barcode or HSN…"
          height={620}
        />
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.sku}` : 'Create product'}</DialogTitle>
        <form onSubmit={onSubmit} noValidate autoComplete="off">
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {serverError && <Alert severity="error">{serverError}</Alert>}

              <Typography variant="subtitle2">Identity</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="SKU"
                  error={Boolean(form.formState.errors.sku)}
                  helperText={form.formState.errors.sku?.message}
                  {...form.register('sku')}
                />
                <TextField
                  label="Name"
                  error={Boolean(form.formState.errors.name)}
                  helperText={form.formState.errors.name?.message}
                  {...form.register('name')}
                />
                <TextField label="Barcode" {...form.register('barcode')} />
              </Stack>
              <TextField
                label="Description"
                multiline
                minRows={2}
                {...form.register('description')}
              />

              <Divider />
              <Typography variant="subtitle2">Catalog</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Controller
                  control={form.control}
                  name="categoryId"
                  render={({ field, fieldState }) => (
                    <TextField
                      select
                      label="Category"
                      value={field.value}
                      onChange={field.onChange}
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message}
                      sx={{ minWidth: 180 }}
                    >
                      {(categories.data ?? []).map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
                <Controller
                  control={form.control}
                  name="brandId"
                  render={({ field, fieldState }) => (
                    <TextField
                      select
                      label="Brand"
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e);
                        form.setValue('seriesId', '');
                        form.setValue('collectionId', '');
                      }}
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message}
                      sx={{ minWidth: 180 }}
                    >
                      {(brands.data ?? []).map((b) => (
                        <MenuItem key={b.id} value={b.id}>
                          {b.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
                <Controller
                  control={form.control}
                  name="seriesId"
                  render={({ field }) => (
                    <TextField
                      select
                      label="Series (optional)"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!watchBrand}
                      sx={{ minWidth: 180 }}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {brandSeries.map((s) => (
                        <MenuItem key={s.id} value={s.id}>
                          {s.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
                <Controller
                  control={form.control}
                  name="collectionId"
                  render={({ field }) => (
                    <TextField
                      select
                      label="Collection (optional)"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!watchBrand}
                      sx={{ minWidth: 180 }}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {brandCollections.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Stack>

              <Divider />
              <Typography variant="subtitle2">Units of measure</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                <TextField label="Size (mm)" placeholder="600x600" {...form.register('sizeMm')} />
                <TextField
                  label="Pieces per box"
                  type="number"
                  error={Boolean(form.formState.errors.piecesPerBox)}
                  helperText={form.formState.errors.piecesPerBox?.message}
                  {...form.register('piecesPerBox')}
                />
                <TextField
                  label="Sq.ft per box"
                  type="number"
                  error={Boolean(form.formState.errors.sqftPerBox)}
                  helperText={form.formState.errors.sqftPerBox?.message}
                  {...form.register('sqftPerBox')}
                />
                <Controller
                  control={form.control}
                  name="baseUom"
                  render={({ field }) => (
                    <TextField
                      select
                      label="Base UOM"
                      value={field.value}
                      onChange={field.onChange}
                      sx={{ minWidth: 120 }}
                    >
                      <MenuItem value="BOX">Box</MenuItem>
                      <MenuItem value="PIECE">Piece</MenuItem>
                      <MenuItem value="SQFT">Sq.ft</MenuItem>
                    </TextField>
                  )}
                />
                <Chip label={`${sqftPerPiece} sqft/piece`} variant="outlined" />
              </Stack>

              <Divider />
              <Typography variant="subtitle2">Tax & pricing</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="HSN code"
                  error={Boolean(form.formState.errors.hsnCode)}
                  helperText={form.formState.errors.hsnCode?.message}
                  {...form.register('hsnCode')}
                />
                <TextField
                  label="GST %"
                  type="number"
                  error={Boolean(form.formState.errors.gstRate)}
                  helperText={form.formState.errors.gstRate?.message}
                  {...form.register('gstRate')}
                />
                <TextField label="MRP (per box)" type="number" {...form.register('mrp')} />
                <TextField
                  label="Selling rate (per box)"
                  type="number"
                  {...form.register('sellingRate')}
                />
                <TextField
                  label="Reorder level (box)"
                  type="number"
                  helperText="Low-stock alert threshold"
                  {...form.register('reorderLevelBoxes')}
                />
              </Stack>

              <Controller
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={field.value} onChange={field.onChange} />}
                    label="Active"
                  />
                )}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={form.formState.isSubmitting}>
              {editing ? 'Save changes' : 'Create product'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete product"
        message={`Delete "${deleting?.name}" (${deleting?.sku})? Products with stock or transactions cannot be removed later phases.`}
        destructive
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            if (deleting) await deleteProduct.mutateAsync(deleting.id);
          } finally {
            setDeleting(null);
          }
        }}
      />
    </PageContainer>
  );
}
