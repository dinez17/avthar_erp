import ClearIcon from '@mui/icons-material/Clear';
import { Button, MenuItem, Stack, TextField } from '@mui/material';
import { useCatalogOptions } from '../catalog/api';
import { useProductSizes } from './api';
import type { ProductFilters } from './api';

export interface ProductFilterBarProps {
  value: ProductFilters;
  onChange: (next: ProductFilters) => void;
  /** Include the series dropdown (hidden on the compact rates screen by default). */
  showSeries?: boolean;
}

/** Brand / category / size (and optionally series) filters shared by the product screens. */
export function ProductFilterBar({
  value,
  onChange,
  showSeries = false,
}: ProductFilterBarProps): JSX.Element {
  const brands = useCatalogOptions('/brands');
  const categories = useCatalogOptions('/categories');
  const allSeries = useCatalogOptions(showSeries ? '/series' : null);
  const sizes = useProductSizes();

  const brandSeries = (allSeries.data ?? []).filter(
    (s) => !value.brandId || s.parentId === value.brandId,
  );

  const hasFilters = Boolean(value.brandId || value.categoryId || value.sizeMm || value.seriesId);

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <TextField
        select
        label="Brand"
        size="small"
        fullWidth={false}
        value={value.brandId ?? ''}
        onChange={(e) =>
          onChange({ ...value, brandId: e.target.value || undefined, seriesId: undefined })
        }
        sx={{ width: 150 }}
      >
        <MenuItem value="">All brands</MenuItem>
        {(brands.data ?? []).map((b) => (
          <MenuItem key={b.id} value={b.id}>
            {b.name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="Category"
        size="small"
        fullWidth={false}
        value={value.categoryId ?? ''}
        onChange={(e) => onChange({ ...value, categoryId: e.target.value || undefined })}
        sx={{ width: 150 }}
      >
        <MenuItem value="">All categories</MenuItem>
        {(categories.data ?? []).map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>

      {showSeries && (
        <TextField
          select
          label="Series"
          size="small"
          fullWidth={false}
          value={value.seriesId ?? ''}
          onChange={(e) => onChange({ ...value, seriesId: e.target.value || undefined })}
          sx={{ width: 150 }}
        >
          <MenuItem value="">All series</MenuItem>
          {brandSeries.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      <TextField
        select
        label="Size"
        size="small"
        fullWidth={false}
        value={value.sizeMm ?? ''}
        onChange={(e) => onChange({ ...value, sizeMm: e.target.value || undefined })}
        sx={{ width: 130 }}
      >
        <MenuItem value="">All sizes</MenuItem>
        {(sizes.data ?? []).map((size) => (
          <MenuItem key={size} value={size}>
            {size}
          </MenuItem>
        ))}
      </TextField>

      {hasFilters && (
        <Button size="small" color="inherit" startIcon={<ClearIcon />} onClick={() => onChange({})}>
          Clear
        </Button>
      )}
    </Stack>
  );
}
