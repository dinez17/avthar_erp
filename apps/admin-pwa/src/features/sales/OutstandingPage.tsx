import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { Chip, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@tiles-erp/ui';
import type { OutstandingRow } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { useBranches } from '../products/branch-prices-api';
import { useOutstanding } from './receipts-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rupees = (value: number): string => `₹${money(value)}`;

/**
 * Who owes what, and for how long. Age runs from the due date where an invoice has one,
 * because that is the promise that was broken.
 */
export function OutstandingPage(): JSX.Element {
  const navigate = useNavigate();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const outstanding = useOutstanding(branchId || undefined);

  const totals = useMemo(() => {
    const rows = outstanding.data ?? [];
    return {
      balance: rows.reduce((sum, row) => sum + row.balanceAmount, 0),
      current: rows.reduce((sum, row) => sum + row.current, 0),
      days30: rows.reduce((sum, row) => sum + row.days30, 0),
      days60: rows.reduce((sum, row) => sum + row.days60, 0),
      days90: rows.reduce((sum, row) => sum + row.days90, 0),
      older: rows.reduce((sum, row) => sum + row.older, 0),
      customers: rows.length,
    };
  }, [outstanding.data]);

  const columns = useMemo<ColDef<OutstandingRow>[]>(
    () => [
      { field: 'customerName', headerName: 'Customer', minWidth: 200 },
      { field: 'phone', headerName: 'Phone', maxWidth: 140 },
      {
        field: 'oldestInvoiceDate',
        headerName: 'Oldest bill',
        maxWidth: 130,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : '—'),
      },
      {
        field: 'current',
        headerName: 'Not due',
        maxWidth: 130,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'days30',
        headerName: '1–30 d',
        maxWidth: 120,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'days60',
        headerName: '31–60 d',
        maxWidth: 120,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'days90',
        headerName: '61–90 d',
        maxWidth: 120,
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'older',
        headerName: '90+ d',
        maxWidth: 120,
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'balanceAmount',
        headerName: 'Outstanding',
        maxWidth: 150,
        cellStyle: { fontWeight: 700 },
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'creditLimit',
        headerName: 'Credit limit',
        maxWidth: 150,
        cellRenderer: (p: ICellRendererParams<OutstandingRow>) => {
          const row = p.data;
          if (!row) return null;
          if (row.creditLimit <= 0) return '—';
          const breached = row.balanceAmount > row.creditLimit;
          return (
            <Chip
              label={money(row.creditLimit)}
              size="small"
              color={breached ? 'error' : 'default'}
            />
          );
        },
      },
      {
        headerName: '',
        maxWidth: 80,
        cellRenderer: (p: ICellRendererParams<OutstandingRow>) => {
          const row = p.data;
          if (!row) return null;
          return (
            <Tooltip title="Open their statement">
              <IconButton
                size="small"
                onClick={() => navigate(`/customer-ledger?customerId=${row.customerId}`)}
              >
                <ReceiptLongIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          );
        },
      },
    ],
    [navigate],
  );

  return (
    <PageContainer
      title="Outstanding"
      subtitle="What customers owe, aged from the date each bill fell due."
      actions={
        <TextField
          select
          label="Branch"
          size="small"
          fullWidth={false}
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          sx={{ width: 180 }}
        >
          <MenuItem value="">All branches</MenuItem>
          {(branches.data ?? []).map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.name}
            </MenuItem>
          ))}
        </TextField>
      }
    >
      <Stack spacing={1.5}>
        <Paper variant="outlined" sx={{ p: 1.25 }}>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Figure label="Outstanding" value={totals.balance} bold />
            <Figure label="Not due" value={totals.current} />
            <Figure label="1–30 days" value={totals.days30} />
            <Figure label="31–60 days" value={totals.days60} />
            <Figure label="61–90 days" value={totals.days90} />
            <Figure label="Over 90 days" value={totals.older} alert={totals.older > 0} />
            <Stack>
              <Typography variant="caption" color="text.secondary">
                Customers
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {totals.customers}
              </Typography>
            </Stack>
          </Stack>
        </Paper>

        <DataTable
          rows={outstanding.data ?? []}
          columns={columns}
          loading={outstanding.isFetching}
          height={560}
        />
      </Stack>
    </PageContainer>
  );
}

function Figure({
  label,
  value,
  bold = false,
  alert = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
  alert?: boolean;
}): JSX.Element {
  return (
    <Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant={bold ? 'h6' : 'body1'}
        fontWeight={bold ? 700 : 500}
        color={alert ? 'error.main' : 'text.primary'}
      >
        {rupees(value)}
      </Typography>
    </Stack>
  );
}
