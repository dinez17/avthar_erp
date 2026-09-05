import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { endOfDayIso, startOfDayIso } from '@tiles-erp/shared';
import { LoadingOverlay, PageContainer } from '@tiles-erp/ui';
import type { GstSummary, Gstr1Return } from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';
import { downloadFile } from '../../lib/download';
import { useBranches } from '../products/branch-prices-api';
import { Gstr1SheetView } from './Gstr1SheetView';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rupees = (value: number): string => `₹${money(value)}`;

/** The first and last day of the month a date falls in — how a GST period is chosen. */
const monthStart = (date = new Date()): string =>
  new Date(date.getFullYear(), date.getMonth(), 1).toLocaleDateString('en-CA');

const monthEnd = (date = new Date()): string =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).toLocaleDateString('en-CA');

/** The period query string every endpoint on this page takes. */
function periodParams(from: string, to: string, branchId: string): string {
  // End of day, or an invoice raised this morning falls outside a period ending today.
  const params = new URLSearchParams({ from: startOfDayIso(from), to: endOfDayIso(to) });
  if (branchId) params.set('branchId', branchId);
  return params.toString();
}

/** The period's totals, for the band across the top. */
function useGstSummary(from: string, to: string, branchId: string) {
  const query = periodParams(from, to, branchId);
  return useQuery({
    queryKey: ['gst-summary', from, to, branchId || null],
    queryFn: () => apiFetch<GstSummary>(`/dashboard/gst-summary?${query}`),
  });
}

/** The return itself, sheet by sheet. */
function useGstr1(from: string, to: string, branchId: string) {
  const query = periodParams(from, to, branchId);
  return useQuery({
    queryKey: ['gstr1', from, to, branchId || null],
    queryFn: () => apiFetch<Gstr1Return>(`/dashboard/gstr1?${query}`),
  });
}

/**
 * The GSTR-1 return for a period, shown the way the GST offline tool's own workbook shows
 * it: totals across the top, then a tab per sheet in the tool's column order. What is
 * about to be uploaded can be read before it is, and downloaded whole or a sheet at a
 * time.
 */
export function GstSummaryPage(): JSX.Element {
  const branches = useBranches();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(monthEnd);
  const [branchId, setBranchId] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useGstSummary(from, to, branchId);
  const gstr1 = useGstr1(from, to, branchId);

  /** The period, as it appears in a filename: 2026-08. */
  const period = from.slice(0, 7);

  const downloadWorkbook = async (): Promise<void> => {
    setDownloading(true);
    setError(null);
    try {
      await downloadFile(
        `/dashboard/gstr1.xlsx?${periodParams(from, to, branchId)}`,
        `GSTR1-${period}.xlsx`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The workbook could not be downloaded.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <PageContainer
      title="GST summary"
      subtitle="Outward supplies for the period, in the GSTR-1 sections the offline tool reads."
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
          <Tooltip title="Every sheet as one workbook, in the GST offline tool's format">
            <span>
              <Button
                className="print-hidden"
                variant="contained"
                startIcon={<DownloadIcon />}
                disabled={downloading}
                onClick={() => void downloadWorkbook()}
              >
                GSTR-1 (xlsx)
              </Button>
            </span>
          </Tooltip>
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
      {(summary.isLoading || gstr1.isLoading) && <LoadingOverlay open />}
      {summary.isError && <Alert severity="error">The GST summary could not be loaded.</Alert>}
      {gstr1.isError && <Alert severity="error">The return sections could not be loaded.</Alert>}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={1.5}>
        {summary.data && (
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
        )}

        {gstr1.data && <Gstr1SheetView data={gstr1.data} period={period} />}

        <Typography variant="caption" color="text.secondary">
          Posted invoices only — a draft is not a supply and a cancelled one never happened, though
          a cancelled number still appears in the documents sheet so the series accounts for it.
          Figures come from the tax stored on each invoice when it was raised, so a rate change
          since then cannot rewrite a filed period.
        </Typography>
      </Stack>
    </PageContainer>
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
