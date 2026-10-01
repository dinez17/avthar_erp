import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { AGEING_BUCKETS, AGEING_BUCKET_LABELS, type CsvValue } from '@tiles-erp/shared';
import { PageContainer } from '@tiles-erp/ui';
import { ApiError } from '../../lib/api-client';
import { useAuth } from '../../auth/AuthProvider';
import { downloadTableExcel, downloadTablePdf, type ExportColumn } from '../../components/ListExportButtons';
import { useBranches } from '../products/branch-prices-api';
import {
  useDispatchedProducts,
  useDriverCash,
  useFreightCollection,
  usePendingAgeing,
  useVehicleRunning,
} from './dispatch-reports-api';
import { useSessionBranchId } from '../../lib/session-branch';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rupees = (value: number): string => `₹${money(value)}`;

const number = (value: number): string => value.toLocaleString('en-IN');

const monthStart = (date = new Date()): string =>
  new Date(date.getFullYear(), date.getMonth(), 1).toLocaleDateString('en-CA');

const today = (): string => new Date().toLocaleDateString('en-CA');

const TABS = [
  { key: 'freight', label: 'Freight collection' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'drivers', label: 'Driver cash' },
  { key: 'backlog', label: 'Waiting to go' },
  { key: 'products', label: 'Dispatched products' },
] as const;

/**
 * The four questions asked of dispatch, one tab each: who owes freight, what the lorries
 * cost, whether the cash came back, and what is still sitting in the godown.
 *
 * Only the open tab fetches — each is a full sweep of the period's gate passes, and
 * loading all four to look at one would be three wasted queries every time.
 */
export function DispatchReportsPage(): JSX.Element {
  const { user } = useAuth();
  const branches = useBranches();
  const [tab, setTab] = useState(0);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useSessionBranchId();
  const [selectedDate, setSelectedDate] = useState(today);
  const canChangeBranch = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN'));
  const availableBranches = useMemo(
    () => (branches.data ?? []).filter((branch) => canChangeBranch || user?.branchIds.includes(branch.id)),
    [branches.data, canChangeBranch, user?.branchIds],
  );
  useEffect(() => {
    if (canChangeBranch) return;
    setBranchId((current) => user?.branchIds.includes(current) ? current : (availableBranches[0]?.id ?? ''));
  }, [availableBranches, canChangeBranch, user?.branchIds]);

  const freight = useFreightCollection(from, to, branchId, tab === 0);
  const vehicles = useVehicleRunning(from, to, branchId, tab === 1);
  const drivers = useDriverCash(from, to, branchId, tab === 2);
  const backlog = usePendingAgeing(branchId, tab === 3);
  const products = useDispatchedProducts(selectedDate, branchId, tab === 4 && (canChangeBranch || Boolean(branchId)));

  const period = from.slice(0, 7);
  const active = [freight, vehicles, drivers, backlog, products][tab];
  const loading = active?.isLoading ?? false;
  // The API's own message, not a generic line: a missing permission or an unreadable
  // date says so, instead of looking like a report with nothing in it.
  const failure =
    active?.error instanceof ApiError
      ? active.error.message
      : active?.isError
        ? 'That report could not be loaded.'
        : null;

  return (
    <PageContainer
      title="Dispatch reports"
      subtitle="Freight owed, what the lorries cost, the driver's cash, and what is still waiting."
      actions={
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
          <TextField
            select
            label="Branch"
            size="small"
            fullWidth={false}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            sx={{ width: 170 }}
          >
            {canChangeBranch && <MenuItem value="">All branches</MenuItem>}
            {availableBranches.map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
              </MenuItem>
            ))}
          </TextField>
          {tab !== 4 && <TextField
            label="From"
            type="date"
            size="small"
            fullWidth={false}
            disabled={tab === 3}
            InputLabelProps={{ shrink: true }}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />}
          {tab !== 4 && <TextField
            label="To"
            type="date"
            size="small"
            fullWidth={false}
            disabled={tab === 3}
            InputLabelProps={{ shrink: true }}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />}
          {tab === 4 && <TextField
            label="Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />}
          <Button
            className="print-hidden"
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1.5}>
        <Tabs
          value={tab}
          onChange={(_, next: number) => setTab(next)}
          sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
          variant="scrollable"
          scrollButtons="auto"
        >
          {TABS.map((each) => (
            <Tab key={each.key} label={each.label} sx={{ minHeight: 40, textTransform: 'none' }} />
          ))}
        </Tabs>

        {tab === 3 && (
          <Typography variant="caption" color="text.secondary">
            The backlog is everything still waiting, whenever it was invoiced — the dates above
            do not apply to it.
          </Typography>
        )}

        {loading && <Typography variant="body2">Working it out…</Typography>}
        {failure && <Alert severity="error">{failure}</Alert>}

        {tab === 0 && freight.data && (
          <Section
            title="Freight by customer"
            filename={`dispatch-freight-${period}.csv`}
            headers={[
              'Customer',
              'Drops',
              'Charged',
              'On the invoice',
              'Paid at branch',
              'Collected',
              'Outstanding',
            ]}
            rows={freight.data.rows.map((row) => [
              row.customerName,
              row.drops,
              row.charged,
              row.billedOnInvoice,
              row.paidAtBranch,
              row.collectedByDriver,
              row.outstanding,
            ])}
          >
            <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">Drops</TableCell>
                  <TableCell align="right">Charged</TableCell>
                  <TableCell align="right">On the invoice</TableCell>
                  <TableCell align="right">Paid at branch</TableCell>
                  <TableCell align="right">Collected</TableCell>
                  <TableCell align="right">Outstanding</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {freight.data.rows.map((row) => (
                  <TableRow key={row.customerId ?? row.customerName} hover>
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell align="right">{row.drops}</TableCell>
                    <TableCell align="right">{money(row.charged)}</TableCell>
                    <TableCell align="right">{money(row.billedOnInvoice)}</TableCell>
                    <TableCell align="right">{money(row.paidAtBranch)}</TableCell>
                    <TableCell align="right">{money(row.collectedByDriver)}</TableCell>
                    <TableCell align="right">
                      {row.outstanding > 0 ? (
                        <Chip label={money(row.outstanding)} size="small" color="warning" />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {freight.data.rows.length === 0 && <Empty colSpan={7} />}
                <Totals
                  cells={[
                    freight.data.totals.drops,
                    money(freight.data.totals.charged),
                    money(freight.data.totals.billedOnInvoice),
                    money(freight.data.totals.paidAtBranch),
                    money(freight.data.totals.collectedByDriver),
                    money(freight.data.totals.outstanding),
                  ]}
                />
              </TableBody>
            </Table>
          </Section>
        )}

        {tab === 1 && vehicles.data && (
          <Section
            title="Vehicle running"
            filename={`dispatch-vehicles-${period}.csv`}
            headers={[
              'Vehicle',
              'Transporter',
              'Trips',
              'Measured',
              'Km',
              'Boxes',
              'Hire',
              'Freight charged',
              'Margin',
              'Cost per km',
            ]}
            rows={vehicles.data.rows.map((row) => [
              row.vehicleNumber,
              row.transporterName ?? 'Own',
              row.trips,
              row.measuredTrips,
              row.km,
              row.boxes,
              row.hireCharge,
              row.chargedFreight,
              row.margin,
              row.costPerKm,
            ])}
          >
            <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Vehicle</TableCell>
                  <TableCell>Transporter</TableCell>
                  <TableCell align="right">Trips</TableCell>
                  <TableCell align="right">Km</TableCell>
                  <TableCell align="right">Boxes</TableCell>
                  <TableCell align="right">Hire</TableCell>
                  <TableCell align="right">Freight</TableCell>
                  <TableCell align="right">Margin</TableCell>
                  <TableCell align="right">₹ / km</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {vehicles.data.rows.map((row) => (
                  <TableRow key={row.vehicleId ?? row.vehicleNumber} hover>
                    <TableCell>{row.vehicleNumber}</TableCell>
                    <TableCell>{row.transporterName ?? 'Own'}</TableCell>
                    <TableCell align="right">
                      {/* A trip with only one odometer reading cannot count towards km. */}
                      {row.measuredTrips < row.trips ? (
                        <Tooltip title={`${row.measuredTrips} of ${row.trips} have both readings`}>
                          <span>
                            {row.trips}
                            <Typography component="span" variant="caption" color="warning.main">
                              {' '}
                              *
                            </Typography>
                          </span>
                        </Tooltip>
                      ) : (
                        row.trips
                      )}
                    </TableCell>
                    <TableCell align="right">{number(row.km)}</TableCell>
                    <TableCell align="right">{number(row.boxes)}</TableCell>
                    <TableCell align="right">{money(row.hireCharge)}</TableCell>
                    <TableCell align="right">{money(row.chargedFreight)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ color: row.margin < 0 ? 'error.main' : undefined, fontWeight: 600 }}
                    >
                      {money(row.margin)}
                    </TableCell>
                    <TableCell align="right">
                      {row.costPerKm === null ? '—' : money(row.costPerKm)}
                    </TableCell>
                  </TableRow>
                ))}
                {vehicles.data.rows.length === 0 && <Empty colSpan={9} />}
                <Totals
                  cells={[
                    '',
                    vehicles.data.totals.trips,
                    number(vehicles.data.totals.km),
                    number(vehicles.data.totals.boxes),
                    money(vehicles.data.totals.hireCharge),
                    money(vehicles.data.totals.chargedFreight),
                    money(vehicles.data.totals.margin),
                    vehicles.data.totals.costPerKm === null
                      ? '—'
                      : money(vehicles.data.totals.costPerKm),
                  ]}
                />
              </TableBody>
            </Table>
          </Section>
        )}

        {tab === 2 && drivers.data && (
          <Section
            title="Driver cash"
            filename={`dispatch-drivers-${period}.csv`}
            headers={[
              'Driver',
              'Trips',
              'To collect',
              'Collected',
              'Handed in',
              'Still with driver',
              'Trips unsettled',
            ]}
            rows={drivers.data.rows.map((row) => [
              row.driverName,
              row.trips,
              row.toCollect,
              row.collected,
              row.cashHandedOver,
              row.stillWithDriver,
              row.tripsWithVariance,
            ])}
          >
            <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Driver</TableCell>
                  <TableCell align="right">Trips</TableCell>
                  <TableCell align="right">To collect</TableCell>
                  <TableCell align="right">Collected</TableCell>
                  <TableCell align="right">Handed in</TableCell>
                  <TableCell align="right">Still with driver</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {drivers.data.rows.map((row) => (
                  <TableRow key={row.driverId ?? row.driverName} hover>
                    <TableCell>{row.driverName}</TableCell>
                    <TableCell align="right">{row.trips}</TableCell>
                    <TableCell align="right">{money(row.toCollect)}</TableCell>
                    <TableCell align="right">{money(row.collected)}</TableCell>
                    <TableCell align="right">{money(row.cashHandedOver)}</TableCell>
                    <TableCell align="right">
                      {row.stillWithDriver === 0 ? (
                        '—'
                      ) : (
                        <Tooltip
                          title={`${row.tripsWithVariance} of ${row.trips} trip${row.trips === 1 ? '' : 's'} not settled`}
                        >
                          <Chip
                            label={money(row.stillWithDriver)}
                            size="small"
                            color="warning"
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {drivers.data.rows.length === 0 && <Empty colSpan={6} />}
                <Totals
                  cells={[
                    drivers.data.totals.trips,
                    money(drivers.data.totals.toCollect),
                    money(drivers.data.totals.collected),
                    money(drivers.data.totals.cashHandedOver),
                    money(drivers.data.totals.stillWithDriver),
                  ]}
                />
              </TableBody>
            </Table>
          </Section>
        )}

        {tab === 3 && backlog.data && (
          <>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                {AGEING_BUCKETS.map((bucket) => {
                  const cell = backlog.data.buckets[bucket];
                  return (
                    <Stack key={bucket}>
                      <Typography variant="caption" color="text.secondary">
                        {AGEING_BUCKET_LABELS[bucket]}
                      </Typography>
                      <Typography
                        variant="h6"
                        fontWeight={700}
                        color={bucket === 'older' && cell.invoices > 0 ? 'error.main' : undefined}
                      >
                        {number(cell.boxes)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {cell.invoices} inv · {rupees(cell.value)}
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>
            </Paper>

            <Section
              title="Invoices waiting to go out"
              filename="dispatch-backlog.csv"
              headers={[
                'Invoice',
                'Date',
                'Customer',
                'Branch',
                'Days waiting',
                'Bucket',
                'Boxes',
                'Value',
                'Status',
              ]}
              rows={backlog.data.rows.map((row) => [
                row.invoiceNumber,
                new Date(row.invoiceDate).toLocaleDateString('en-IN'),
                row.customerName,
                row.branchName,
                row.waitingDays,
                AGEING_BUCKET_LABELS[row.bucket],
                row.pendingQtyBoxes,
                row.pendingValue,
                row.partlyDispatched ? 'Part dispatched' : 'Not sent',
              ])}
            >
              <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Branch</TableCell>
                    <TableCell align="right">Waiting</TableCell>
                    <TableCell align="right">Boxes</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {backlog.data.rows.map((row) => (
                    <TableRow key={row.salesInvoiceId} hover>
                      <TableCell>
                        <Typography variant="body2">{row.invoiceNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(row.invoiceDate).toLocaleDateString('en-IN')}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.branchName}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${row.waitingDays} d`}
                          size="small"
                          color={
                            row.bucket === 'older'
                              ? 'error'
                              : row.bucket === 'days90' || row.bucket === 'days60'
                                ? 'warning'
                                : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell align="right">{number(row.pendingQtyBoxes)}</TableCell>
                      <TableCell align="right">{money(row.pendingValue)}</TableCell>
                      <TableCell>
                        {row.partlyDispatched ? (
                          <Chip label="part sent" size="small" variant="outlined" color="warning" />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Not sent
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {backlog.data.rows.length === 0 && <Empty colSpan={7} />}
                </TableBody>
              </Table>
            </Section>
          </>
        )}

        {tab === 4 && products.data && (
          <Section
            title="Product-wise dispatched items"
            filename={`dispatched-products-${selectedDate}.csv`}
            headers={['Time', 'Invoice', 'Customer', 'Branch', 'SKU', 'Product', 'Size', 'Boxes', 'Pieces', 'Qty boxes', 'Actual stock', 'Stock updated']}
            rows={products.data.rows.map((row) => [
              new Date(row.dispatchedAt).toLocaleString('en-IN'), row.invoiceNumber,
              row.customerName, row.branchName, row.sku, row.productName, row.sizeMm ?? '',
              row.boxes, row.pieces, row.qtyBoxes, row.actualStockBoxes,
              row.stockUpdatedAt ? new Date(row.stockUpdatedAt).toLocaleString('en-IN') : '',
            ])}
          >
            <Table size="small" sx={{ '& td, & th': { py: 0.5 }, minWidth: 1100 }}>
              <TableHead><TableRow>
                <TableCell>Time / Invoice</TableCell><TableCell>Customer</TableCell><TableCell>Product</TableCell>
                <TableCell>Size</TableCell><TableCell align="right">Box</TableCell><TableCell align="right">Pcs</TableCell>
                <TableCell align="right">Qty</TableCell><TableCell align="right">Actual stock</TableCell><TableCell>Stock last updated</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {products.data.rows.map((row, index) => <TableRow key={`${row.salesInvoiceId}-${row.productId}-${index}`} hover>
                  <TableCell><Typography variant="body2">{new Date(row.dispatchedAt).toLocaleTimeString('en-IN')}</Typography><Typography variant="caption" color="text.secondary">{row.invoiceNumber}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{row.customerName}</Typography><Typography variant="caption" color="text.secondary">{row.branchName}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{row.productName}</Typography><Typography variant="caption" color="text.secondary">{row.sku}</Typography></TableCell>
                  <TableCell>{row.sizeMm ?? '—'}</TableCell><TableCell align="right">{row.boxes}</TableCell><TableCell align="right">{row.pieces}</TableCell>
                  <TableCell align="right">{number(row.qtyBoxes)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{number(row.actualStockBoxes)}</TableCell>
                  <TableCell>{row.stockUpdatedAt ? new Date(row.stockUpdatedAt).toLocaleString('en-IN') : '—'}</TableCell>
                </TableRow>)}
                {products.data.rows.length === 0 && <Empty colSpan={9} />}
                <Totals cells={['', '', '', products.data.totals.boxes, products.data.totals.pieces, number(products.data.totals.qtyBoxes), '', '']} />
              </TableBody>
            </Table>
          </Section>
        )}
      </Stack>
    </PageContainer>
  );
}

/** A titled report table with its own CSV button. */
function Section({
  title,
  filename,
  headers,
  rows,
  children,
}: {
  title: string;
  filename: string;
  headers: string[];
  rows: CsvValue[][];
  children: React.ReactNode;
}): JSX.Element {
  type Row = Record<string, CsvValue>;
  const exportRows: Row[] = rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  const exportColumns: ExportColumn<Row>[] = headers.map((header) => ({ header, value: (row) => String(row[header] ?? '') }));
  const baseName = filename.replace(/\.csv$/i, '');
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Stack direction="row" spacing={1} className="print-hidden">
          <Button size="small" startIcon={<DownloadIcon />} disabled={!rows.length} onClick={() => downloadTableExcel(`${baseName}.xls`, title, exportColumns, exportRows)}>Excel</Button>
          <Button size="small" startIcon={<PictureAsPdfIcon />} disabled={!rows.length} onClick={() => downloadTablePdf(`${baseName}.pdf`, title, exportColumns, exportRows)}>PDF</Button>
        </Stack>
      </Stack>
      {children}
    </Paper>
  );
}

/** The bottom line, right-aligned under whichever columns it was given. */
function Totals({ cells }: { cells: (string | number)[] }): JSX.Element {
  return (
    <TableRow sx={{ '& td': { fontWeight: 700, borderTop: 2, borderColor: 'divider' } }}>
      <TableCell>Total</TableCell>
      {cells.map((cell, index) => (
        <TableCell key={index} align="right">
          {cell}
        </TableCell>
      ))}
    </TableRow>
  );
}

function Empty({ colSpan }: { colSpan: number }): JSX.Element {
  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <Typography variant="body2" color="text.secondary">
          Nothing in this period.
        </Typography>
      </TableCell>
    </TableRow>
  );
}
