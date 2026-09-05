import PrintIcon from '@mui/icons-material/Print';
import TableViewIcon from '@mui/icons-material/TableView';
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
import { useState } from 'react';
import { toDateInput, type CsvValue } from '@tiles-erp/shared';
import { LoadingOverlay, PageContainer } from '@tiles-erp/ui';
import type { TaxLeg } from '@tiles-erp/shared-types';
import { ApiError } from '../../lib/api-client';
import { downloadCsv } from '../../lib/download';
import { useBranches } from '../products/branch-prices-api';
import { usePurchaseGst, useTaxPosition } from './purchase-gst-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rupees = (value: number): string => `₹${money(value)}`;

const monthStart = (date = new Date()): string =>
  toDateInput(new Date(date.getFullYear(), date.getMonth(), 1));

const monthEnd = (date = new Date()): string =>
  toDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));

const TABS = ['By tax rate', 'By HSN', 'By supplier'] as const;

/**
 * The inward half of GST: what was paid on purchases, and how much of it can be set off
 * against the tax charged on sales.
 *
 * The position across the top is the answer people come for — the tables underneath are
 * how it was arrived at.
 */
export function PurchaseGstPage(): JSX.Element {
  const branches = useBranches();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);
  const [branchId, setBranchId] = useState('');
  const [tab, setTab] = useState(0);

  const summary = usePurchaseGst(from, to, branchId);
  const position = useTaxPosition(from, to, branchId);

  const period = from.slice(0, 7);
  const failure =
    summary.error instanceof ApiError
      ? summary.error.message
      : position.error instanceof ApiError
        ? position.error.message
        : summary.isError || position.isError
          ? 'That report could not be loaded.'
          : null;

  return (
    <PageContainer
      title="Purchase GST"
      subtitle="Tax paid on inward supplies, and the credit it sets against your sales."
      actions={
        <Stack direction="row" spacing={1}>
          <TextField
            select
            label="Branch"
            size="small"
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
            label="From"
            type="date"
            size="small"
            fullWidth={false}
            InputLabelProps={{ shrink: true }}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            fullWidth={false}
            InputLabelProps={{ shrink: true }}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
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
      {(summary.isLoading || position.isLoading) && <LoadingOverlay open />}
      {failure && <Alert severity="error">{failure}</Alert>}

      <Stack spacing={1.5}>
        {position.data && (
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" gutterBottom>
              Tax position for the period
            </Typography>
            <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell align="right">CGST</TableCell>
                  <TableCell align="right">SGST</TableCell>
                  <TableCell align="right">IGST</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <LegRow label="Output tax — charged on sales" leg={position.data.output} />
                <LegRow label="Input credit — paid on purchases" leg={position.data.input} />
                <LegRow label="Net" leg={position.data.net} bold />
              </TableBody>
            </Table>

            <Stack
              direction="row"
              spacing={4}
              justifyContent="flex-end"
              sx={{ mt: 1 }}
              flexWrap="wrap"
              useFlexGap
            >
              {position.data.ineligibleInput > 0 && (
                <Tooltip title="Paid to suppliers with no GSTIN on file, so it cannot be claimed">
                  <Stack>
                    <Typography variant="caption" color="text.secondary">
                      Not claimable
                    </Typography>
                    <Typography variant="body1" color="warning.main" fontWeight={500}>
                      {rupees(position.data.ineligibleInput)}
                    </Typography>
                  </Stack>
                </Tooltip>
              )}
              {position.data.creditCarriedForward > 0 && (
                <Stack>
                  <Typography variant="caption" color="text.secondary">
                    Credit carried forward
                  </Typography>
                  <Typography variant="body1" fontWeight={500}>
                    {rupees(position.data.creditCarriedForward)}
                  </Typography>
                </Stack>
              )}
              <Stack>
                <Typography variant="caption" color="text.secondary">
                  Payable in cash
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {rupees(position.data.payable)}
                </Typography>
              </Stack>
            </Stack>

            <Typography variant="caption" color="text.secondary">
              Netted head by head: CGST credit cannot pay an SGST liability, so a period can
              owe tax and carry credit at the same time. This is for seeing the position — the
              return decides the IGST set-off order.
            </Typography>
          </Paper>
        )}

        {summary.data && (
          <>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                <Figure label="Invoices" value={String(summary.data.invoiceCount)} />
                <Figure label="Taxable value" value={rupees(summary.data.taxableValue)} />
                <Figure label="CGST" value={rupees(summary.data.cgstAmount)} />
                <Figure label="SGST" value={rupees(summary.data.sgstAmount)} />
                <Figure label="IGST" value={rupees(summary.data.igstAmount)} />
                <Figure label="Total tax" value={rupees(summary.data.totalTax)} bold />
                <Figure label="Invoice value" value={rupees(summary.data.invoiceValue)} bold />
              </Stack>
            </Paper>

            <Tabs
              value={tab}
              onChange={(_, next: number) => setTab(next)}
              sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
            >
              {TABS.map((label) => (
                <Tab key={label} label={label} sx={{ minHeight: 40, textTransform: 'none' }} />
              ))}
            </Tabs>

            {tab === 0 && (
              <Section
                title="Inward supplies by tax rate"
                filename={`purchase-gst-by-rate-${period}.csv`}
                headers={['Rate %', 'Invoices', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total tax']}
                rows={summary.data.byRate.map((row) => [
                  row.gstRate,
                  row.invoiceCount,
                  row.taxableValue,
                  row.cgstAmount,
                  row.sgstAmount,
                  row.igstAmount,
                  row.totalTax,
                ])}
              >
                <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Rate</TableCell>
                      <TableCell align="right">Invoices</TableCell>
                      <TableCell align="right">Taxable value</TableCell>
                      <TableCell align="right">CGST</TableCell>
                      <TableCell align="right">SGST</TableCell>
                      <TableCell align="right">IGST</TableCell>
                      <TableCell align="right">Total tax</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.data.byRate.map((row) => (
                      <TableRow key={row.gstRate} hover>
                        <TableCell>{row.gstRate}%</TableCell>
                        <TableCell align="right">{row.invoiceCount}</TableCell>
                        <TableCell align="right">{money(row.taxableValue)}</TableCell>
                        <TableCell align="right">{money(row.cgstAmount)}</TableCell>
                        <TableCell align="right">{money(row.sgstAmount)}</TableCell>
                        <TableCell align="right">{money(row.igstAmount)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {money(row.totalTax)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {summary.data.byRate.length === 0 && <Empty colSpan={7} />}
                  </TableBody>
                </Table>
              </Section>
            )}

            {tab === 1 && (
              <Section
                title="Inward supplies by HSN"
                filename={`purchase-gst-by-hsn-${period}.csv`}
                headers={['HSN', 'Products', 'Boxes', 'Taxable value', 'Total tax']}
                rows={summary.data.byHsn.map((row) => [
                  row.hsnCode,
                  row.productCount,
                  row.qtyBoxes,
                  row.taxableValue,
                  row.totalTax,
                ])}
              >
                <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>HSN</TableCell>
                      <TableCell align="right">Products</TableCell>
                      <TableCell align="right">Boxes</TableCell>
                      <TableCell align="right">Taxable value</TableCell>
                      <TableCell align="right">Total tax</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.data.byHsn.map((row) => (
                      <TableRow key={row.hsnCode} hover>
                        <TableCell>
                          {row.hsnCode === 'Not set' ? (
                            <Chip label="HSN not set" size="small" color="warning" />
                          ) : (
                            row.hsnCode
                          )}
                        </TableCell>
                        <TableCell align="right">{row.productCount}</TableCell>
                        <TableCell align="right">{row.qtyBoxes}</TableCell>
                        <TableCell align="right">{money(row.taxableValue)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {money(row.totalTax)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {summary.data.byHsn.length === 0 && <Empty colSpan={5} />}
                  </TableBody>
                </Table>
              </Section>
            )}

            {tab === 2 && (
              <Section
                title="Inward supplies by supplier"
                filename={`purchase-gst-by-supplier-${period}.csv`}
                headers={[
                  'Supplier',
                  'GSTIN',
                  'Supply',
                  'Invoices',
                  'Taxable value',
                  'CGST',
                  'SGST',
                  'IGST',
                  'Total tax',
                ]}
                rows={summary.data.bySupplier.map((row) => [
                  row.supplierName,
                  row.gstin ?? '',
                  row.isInterState ? 'Inter-state' : 'Intra-state',
                  row.invoiceCount,
                  row.taxableValue,
                  row.cgstAmount,
                  row.sgstAmount,
                  row.igstAmount,
                  row.totalTax,
                ])}
              >
                <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Supplier</TableCell>
                      <TableCell>GSTIN</TableCell>
                      <TableCell align="right">Invoices</TableCell>
                      <TableCell align="right">Taxable value</TableCell>
                      <TableCell align="right">Total tax</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.data.bySupplier.map((row) => (
                      <TableRow key={row.supplierId} hover>
                        <TableCell>
                          <Typography variant="body2">{row.supplierName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.isInterState ? 'Inter-state' : 'Intra-state'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {row.gstin ? (
                            <Typography variant="caption" fontFamily="monospace">
                              {row.gstin}
                            </Typography>
                          ) : (
                            <Tooltip title="No GSTIN on file, so this tax cannot be claimed">
                              <Chip label="No GSTIN" size="small" color="warning" />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell align="right">{row.invoiceCount}</TableCell>
                        <TableCell align="right">{money(row.taxableValue)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {money(row.totalTax)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {summary.data.bySupplier.length === 0 && <Empty colSpan={5} />}
                  </TableBody>
                </Table>
              </Section>
            )}

            <Typography variant="caption" color="text.secondary">
              Posted purchase invoices only. The CGST/SGST/IGST split is worked out from where
              the supplier is against where the branch is, using the same rule the sales side
              uses — a purchase and a sale across the same state line split identically.
            </Typography>
          </>
        )}
      </Stack>
    </PageContainer>
  );
}

/** One line of the position table: a leg split three ways, with its total. */
function LegRow({
  label,
  leg,
  bold = false,
}: {
  label: string;
  leg: TaxLeg;
  bold?: boolean;
}): JSX.Element {
  return (
    <TableRow sx={bold ? { '& td': { fontWeight: 700, borderTop: 2, borderColor: 'divider' } } : {}}>
      <TableCell>{label}</TableCell>
      <TableCell align="right">{money(leg.cgst)}</TableCell>
      <TableCell align="right">{money(leg.sgst)}</TableCell>
      <TableCell align="right">{money(leg.igst)}</TableCell>
      <TableCell align="right">{money(leg.total)}</TableCell>
    </TableRow>
  );
}

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
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Button
          className="print-hidden"
          size="small"
          startIcon={<TableViewIcon />}
          disabled={rows.length === 0}
          onClick={() => downloadCsv(filename, headers, rows)}
        >
          CSV
        </Button>
      </Stack>
      {children}
    </Paper>
  );
}

function Empty({ colSpan }: { colSpan: number }): JSX.Element {
  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <Typography variant="body2" color="text.secondary">
          Nothing purchased in this period.
        </Typography>
      </TableCell>
    </TableRow>
  );
}

function Figure({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}): JSX.Element {
  return (
    <Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant={bold ? 'h6' : 'body1'} fontWeight={bold ? 700 : 500}>
        {value}
      </Typography>
    </Stack>
  );
}
