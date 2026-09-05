import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBoxPieces } from '@tiles-erp/shared';
import { LoadingOverlay, PageContainer } from '@tiles-erp/ui';
import type { DailySales, DashboardSummary } from '@tiles-erp/shared-types';
import { apiFetch } from '../lib/api-client';
import { useCashPosition } from '../features/accounts/api';
import { useBranches } from '../features/products/branch-prices-api';

const RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
] as const;

const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const exact = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dayLabel = (date: string): string =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

function useDashboard(days: number, branchId: string) {
  const from = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ from });
  if (branchId) params.set('branchId', branchId);
  return useQuery({
    queryKey: ['dashboard', days, branchId || null],
    queryFn: () => apiFetch<DashboardSummary>(`/dashboard/summary?${params.toString()}`),
    staleTime: 60_000,
  });
}

/** The figures the counter and the owner look at first thing in the morning. */
export function OverviewPage(): JSX.Element {
  const navigate = useNavigate();
  const branches = useBranches();
  const [days, setDays] = useState<number>(30);
  const [branchId, setBranchId] = useState('');
  const { data, isLoading, isError } = useDashboard(days, branchId);
  const { data: position } = useCashPosition(new Date().toISOString(), branchId || undefined);

  return (
    <PageContainer
      title="Overview"
      subtitle="Today at a glance, and how the period is going."
      actions={
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label="Branch"
            fullWidth={false}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            sx={{ width: 170 }}
          >
            <MenuItem value="">All branches</MenuItem>
            {(branches.data ?? []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Period"
            fullWidth={false}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            sx={{ width: 150 }}
          >
            {RANGES.map((range) => (
              <MenuItem key={range.value} value={range.value}>
                {range.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      }
    >
      {isLoading && <LoadingOverlay open />}
      {isError && <Alert severity="error">The overview could not be loaded.</Alert>}

      {data && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Kpi
              label="Sales today"
              value={money(data.todaySalesValue)}
              note={`${data.todayInvoiceCount} invoice${data.todayInvoiceCount === 1 ? '' : 's'}`}
              onClick={() => navigate('/sales-invoices')}
            />
            <Kpi
              label="Collected today"
              value={money(data.todayCollectedValue)}
              note="Receipts posted"
              onClick={() => navigate('/collections')}
            />
            <Kpi
              label="Outstanding"
              value={money(data.outstandingValue)}
              note={data.overdueValue > 0 ? `${money(data.overdueValue)} overdue` : 'Nothing overdue'}
              tone={data.overdueValue > 0 ? 'warning' : 'default'}
              onClick={() => navigate('/outstanding')}
            />
            <Kpi
              label="Orders pending"
              value={money(data.pendingOrderValue)}
              note={`${data.pendingOrderCount} to invoice`}
              onClick={() => navigate('/sales-orders')}
            />
            <Kpi
              label="Stock value"
              value={money(data.stockValue)}
              note="At landing cost"
              onClick={() => navigate('/stock')}
            />
            <Kpi
              label="Low stock"
              value={String(data.lowStockCount)}
              note="Below reorder level"
              tone={data.lowStockCount > 0 ? 'warning' : 'default'}
              onClick={() => navigate('/stock/reports')}
            />
            {/*
              Cash comes from the accounts module rather than the dashboard payload. It is
              a different question — "where is the money right now" rather than "how did
              the period go" — and reaching across modules to fold it into one response
              would tie the sales dashboard to the cash book for no gain.
            */}
            {position && (
              <>
                <Kpi
                  label="Cash in tills"
                  value={money(position.totalCash)}
                  note={`Bank ${money(position.totalBank)}`}
                  onClick={() => navigate('/cash-book')}
                />
                {position.totalWithOwners > 0 && (
                  <Kpi
                    label="With owners"
                    value={money(position.totalWithOwners)}
                    note="Handed over at day close"
                    onClick={() => navigate('/owner-statement')}
                  />
                )}
              </>
            )}
          </Stack>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack
              direction="row"
              spacing={3}
              justifyContent="space-between"
              alignItems="baseline"
              flexWrap="wrap"
              useFlexGap
            >
              <Typography variant="subtitle2">Sales over the period</Typography>
              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                <Figure label="Sales" value={exact(data.periodSalesValue)} />
                <Figure label="GST" value={exact(data.periodGstValue)} />
                <Figure label="Collected" value={exact(data.periodCollectedValue)} />
                <Figure label="Purchases" value={exact(data.periodPurchaseValue)} />
                <Figure label="Invoices" value={String(data.periodInvoiceCount)} />
              </Stack>
            </Stack>
            <SalesTrend days={data.dailySales} />
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" gutterBottom>
              Best sellers
            </Typography>
            {data.topProducts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nothing invoiced in this period yet.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell>Product</TableCell>
                    <TableCell align="right">Sold</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.topProducts.map((product) => (
                    <TableRow key={product.productId}>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell>{product.productName}</TableCell>
                      <TableCell align="right">
                        {formatBoxPieces(
                          product.qtyBoxes,
                          product.piecesPerBox,
                          product.baseUom === 'PIECE',
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {exact(product.salesValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Stack>
      )}
    </PageContainer>
  );
}

/**
 * A plain CSS bar chart. A charting library would be a large dependency for one view;
 * bars scaled against the busiest day say everything a trend needs to.
 */
function SalesTrend({ days }: { days: DailySales[] }): JSX.Element {
  const peak = Math.max(...days.map((day) => day.salesValue), 1);

  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="flex-end"
      sx={{ height: 140, mt: 1.5, overflowX: 'auto' }}
    >
      {days.map((day) => (
        <Tooltip
          key={day.date}
          title={`${dayLabel(day.date)} · ${exact(day.salesValue)} · ${day.invoiceCount} invoice${
            day.invoiceCount === 1 ? '' : 's'
          }`}
        >
          <Stack alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 14 }}>
            <Box
              sx={{
                width: '100%',
                height: `${Math.max((day.salesValue / peak) * 110, day.salesValue > 0 ? 3 : 1)}px`,
                bgcolor: day.salesValue > 0 ? 'primary.main' : 'action.disabledBackground',
                borderRadius: 0.5,
              }}
            />
            <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary' }}>
              {dayLabel(day.date).split(' ')[0]}
            </Typography>
          </Stack>
        </Tooltip>
      ))}
    </Stack>
  );
}

function Kpi({
  label,
  value,
  note,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'default' | 'warning';
  onClick?: () => void;
}): JSX.Element {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 1.5,
        flex: '1 1 180px',
        minWidth: 180,
        cursor: onClick ? 'pointer' : 'default',
        borderColor: tone === 'warning' ? 'warning.main' : undefined,
        '&:hover': onClick ? { borderColor: 'primary.main' } : undefined,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700}>
        {value}
      </Typography>
      <Chip
        label={note}
        size="small"
        color={tone === 'warning' ? 'warning' : 'default'}
        sx={{ mt: 0.5 }}
      />
    </Paper>
  );
}

function Figure({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1" fontWeight={600}>
        {value}
      </Typography>
    </Stack>
  );
}
