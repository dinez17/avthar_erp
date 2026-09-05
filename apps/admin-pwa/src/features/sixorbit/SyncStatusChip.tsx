import { Chip, Tooltip } from '@mui/material';
import type { ProductSyncStatus } from '@tiles-erp/shared-types';

/**
 * How a product stands with SixOrbit, in one glance.
 *
 * The wording avoids the enum on purpose — "Needs a brand in SixOrbit" tells an operator
 * what to do, where BLOCKED tells them only that something is wrong.
 */
const PRESENTATION: Record<
  ProductSyncStatus,
  { label: string; color: 'default' | 'success' | 'info' | 'warning' | 'error' }
> = {
  NOT_SYNCED: { label: 'Not sent', color: 'default' },
  PENDING: { label: 'Queued', color: 'info' },
  SYNCED: { label: 'Synced', color: 'success' },
  NEEDS_ATTENTION: { label: 'Check data', color: 'warning' },
  BLOCKED: { label: 'Blocked', color: 'warning' },
  FAILED: { label: 'Failed', color: 'error' },
};

export function SyncStatusChip({
  status,
  error,
}: {
  status: ProductSyncStatus | null;
  error?: string | null;
}): JSX.Element | null {
  if (!status) return null;
  const { label, color } = PRESENTATION[status];
  const chip = <Chip size="small" label={label} color={color} variant="outlined" />;
  // The reason is the useful half of a blocked or failed row, and it is far too long for
  // a grid cell.
  return error ? <Tooltip title={error}>{chip}</Tooltip> : chip;
}
