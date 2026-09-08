import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import PaymentsIcon from '@mui/icons-material/Payments';
import SavingsIcon from '@mui/icons-material/Savings';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBoxPieces } from '@tiles-erp/shared';
import { LoadingOverlay, PageContainer } from '@tiles-erp/ui';
import type { DashboardSummary } from '@tiles-erp/shared-types';
import { apiFetch } from '../lib/api-client';
import { Chart } from '../components/Chart';
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

/**
 * Axis labels in lakhs and crores.
 *
 * A y-axis reading "₹58,42,310" at every tick is unreadable at chart scale, and the
 * Indian grouping is what the reader thinks in — not "5.8M".
 */
const compact = (value: number): string => {
  if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${value}`;
};

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
        <Stack spacing={2}>
          {/* Summary before detail: the four figures that decide whether anything
              needs doing today. Everything else on the page explains these. */}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
            }}
          >
            <StatCard
              icon={PaymentsIcon}
              tone="primary"
              label="Sales today"
              value={money(data.todaySalesValue)}
              note={`${data.todayInvoiceCount} invoice${data.todayInvoiceCount === 1 ? '' : 's'}`}
              onClick={() => navigate('/sales-invoices')}
            />
            <StatCard
              icon={SavingsIcon}
              tone="success"
              label="Collected today"
              value={money(data.todayCollectedValue)}
              note="Receipts posted"
              onClick={() => navigate('/collections')}
            />
            <StatCard
              icon={HourglassTopIcon}
              tone={data.overdueValue > 0 ? 'warning' : 'info'}
              label="Outstanding"
              value={money(data.outstandingValue)}
              note={
                data.overdueValue > 0 ? `${money(data.overdueValue)} overdue` : 'Nothing overdue'
              }
              alert={data.overdueValue > 0}
              onClick={() => navigate('/outstanding')}
            />
            <StatCard
              icon={Inventory2Icon}
              tone={data.lowStockCount > 0 ? 'error' : 'success'}
              label="Low stock"
              value={String(data.lowStockCount)}
              note="Below reorder level"
              alert={data.lowStockCount > 0}
              onClick={() => navigate('/stock/reports')}
            />
          </Box>

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
              alignItems: 'start',
            }}
          >
            <Card>
              <CardHeader
                title="Sales over the period"
                subheader={`Daily invoiced value · last ${days} days`}
              />
              <CardContent>
                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  <Figure label="Sales" value={exact(data.periodSalesValue)} />
                  <Figure label="GST" value={exact(data.periodGstValue)} />
                  <Figure label="Collected" value={exact(data.periodCollectedValue)} />
                  <Figure label="Purchases" value={exact(data.periodPurchaseValue)} />
                  <Figure label="Invoices" value={String(data.periodInvoiceCount)} />
                </Stack>

                <Chart
                  type="area"
                  height={280}
                  series={[
                    {
                      name: 'Sales',
                      data: data.dailySales.map((day) => Math.round(day.salesValue)),
                    },
                  ]}
                  options={{
                    fill: {
                      type: 'gradient',
                      gradient: {
                        shadeIntensity: 1,
                        opacityFrom: 0.28,
                        opacityTo: 0.02,
                        stops: [0, 95],
                      },
                    },
                    xaxis: {
                      categories: data.dailySales.map((day) => dayLabel(day.date)),
                      // A 90-day range would otherwise print 90 overlapping labels.
                      tickAmount: Math.min(data.dailySales.length, 10),
                    },
                    yaxis: { labels: { formatter: compact } },
                    legend: { show: false },
                    tooltip: { y: { formatter: (v: number) => exact(v) } },
                  }}
                />
              </CardContent>
            </Card>

            <Stack spacing={2}>
              <Card>
                <CardHeader title="Pipeline" subheader="Committed but not yet invoiced" />
                <CardContent>
                  <Stack spacing={1.5}>
                    <MiniRow
                      icon={ReceiptLongIcon}
                      tone="primary"
                      label="Orders pending"
                      value={money(data.pendingOrderValue)}
                      note={`${data.pendingOrderCount} to invoice`}
                      onClick={() => navigate('/sales-orders')}
                    />
                    <MiniRow
                      icon={Inventory2Icon}
                      tone="info"
                      label="Stock value"
                      value={money(data.stockValue)}
                      note="At landing cost"
                      onClick={() => navigate('/stock')}
                    />
                  </Stack>
                </CardContent>
              </Card>

              {/*
                Cash comes from the accounts module rather than the dashboard payload. It is
                a different question — "where is the money right now" rather than "how did
                the period go" — and reaching across modules to fold it into one response
                would tie the sales dashboard to the cash book for no gain.
              */}
              {position && (
                <Card>
                  <CardHeader title="Cash position" subheader="As of now" />
                  <CardContent>
                    <Stack spacing={1.5}>
                      <MiniRow
                        icon={AccountBalanceWalletIcon}
                        tone="success"
                        label="Cash in tills"
                        value={money(position.totalCash)}
                        note={`Bank ${money(position.totalBank)}`}
                        onClick={() => navigate('/cash-book')}
                      />
                      {position.totalWithOwners > 0 && (
                        <MiniRow
                          icon={SavingsIcon}
                          tone="warning"
                          label="With owners"
                          value={money(position.totalWithOwners)}
                          note="Handed over at day close"
                          onClick={() => navigate('/owner-statement')}
                        />
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              )}
            </Stack>
          </Box>

          <Card>
            <CardHeader title="Best sellers" subheader={`Top products, last ${days} days`} />
            {data.topProducts.length === 0 ? (
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Nothing invoiced in this period yet.
                </Typography>
              </CardContent>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table>
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
                      <TableRow key={product.productId} hover>
                        <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>
                          {product.sku}
                        </TableCell>
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
              </Box>
            )}
          </Card>
        </Stack>
      )}
    </PageContainer>
  );
}

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info';

/** The tinted rounded square that carries each figure's icon. */
function IconChip({
  icon: Icon,
  tone,
  size = 44,
}: {
  icon: SvgIconComponent;
  tone: Tone;
  size?: number;
}): JSX.Element {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${Math.round(size * 0.3)}px`,
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
        // palette[tone].light is the soft wash set in palette.ts.
        bgcolor: theme.palette[tone].light,
        color: theme.palette[tone].main,
      }}
    >
      <Icon sx={{ fontSize: size * 0.5 }} />
    </Box>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  note,
  alert = false,
  onClick,
}: {
  icon: SvgIconComponent;
  tone: Tone;
  label: string;
  value: string;
  note: string;
  alert?: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform .15s, box-shadow .15s',
        '&:hover': onClick ? { transform: 'translateY(-2px)' } : undefined,
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <IconChip icon={icon} tone={tone} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.disabled" fontWeight={500}>
              {label}
            </Typography>
            <Typography
              className="num"
              sx={{
                fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
                fontWeight: 800,
                fontSize: '1.5rem',
                letterSpacing: '-0.7px',
                lineHeight: 1.2,
                mt: 0.25,
              }}
            >
              {value}
            </Typography>
          </Box>
        </Stack>
        <Box sx={{ mt: 1.5 }}>
          <Chip
            label={note}
            size="small"
            // State is carried by the chip's colour only when there is something to
            // act on; a quiet figure stays neutral so the coloured ones stand out.
            color={alert ? tone : 'default'}
            variant={alert ? 'filled' : 'outlined'}
          />
        </Box>
      </CardContent>
    </Card>
  );
}

function MiniRow({
  icon,
  tone,
  label,
  value,
  note,
  onClick,
}: {
  icon: SvgIconComponent;
  tone: Tone;
  label: string;
  value: string;
  note: string;
  onClick?: () => void;
}): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      onClick={onClick}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 2,
        p: 0.5,
        '&:hover': onClick ? { bgcolor: 'action.hover' } : undefined,
      }}
    >
      <IconChip icon={icon} tone={tone} size={36} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {label}
        </Typography>
        <Typography variant="caption" color="text.disabled" noWrap>
          {note}
        </Typography>
      </Box>
      <Box sx={{ ml: 'auto', textAlign: 'right' }}>
        <Typography
          className="num"
          sx={{
            fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
            fontWeight: 700,
            fontSize: '0.95rem',
          }}
        >
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

function Figure({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Stack>
      <Typography variant="caption" color="text.disabled">
        {label}
      </Typography>
      <Typography className="num" variant="body1" fontWeight={700}>
        {value}
      </Typography>
    </Stack>
  );
}
