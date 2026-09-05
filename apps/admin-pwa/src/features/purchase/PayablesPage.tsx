import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TableViewIcon from '@mui/icons-material/TableView';
import {
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@tiles-erp/ui';
import type { PayableRow } from '@tiles-erp/shared-types';
import { DataTable } from '../../components/DataTable';
import { downloadCsv } from '../../lib/download';
import { useBranches } from '../products/branch-prices-api';
import { usePayables } from './supplier-payments-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rupees = (value: number): string => `₹${money(value)}`;

/**
 * What you owe, to whom, and for how long.
 *
 * Age runs from the due date, not the bill date: a supplier on 60 days who billed you
 * last month is not late, and one on 7 days who billed you a fortnight ago is.
 */
export function PayablesPage(): JSX.Element {
  const navigate = useNavigate();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const payables = usePayables(branchId || undefined);

  const rows = useMemo(() => payables.data ?? [], [payables.data]);

  const totals = useMemo(
    () => ({
      balance: rows.reduce((sum, row) => sum + row.balanceAmount, 0),
      current: rows.reduce((sum, row) => sum + row.current, 0),
      days30: rows.reduce((sum, row) => sum + row.days30, 0),
      days60: rows.reduce((sum, row) => sum + row.days60, 0),
      days90: rows.reduce((sum, row) => sum + row.days90, 0),
      older: rows.reduce((sum, row) => sum + row.older, 0),
      credit: rows.reduce((sum, row) => sum + row.creditAvailable, 0),
      suppliers: rows.length,
    }),
    [rows],
  );

  const overdue = totals.days30 + totals.days60 + totals.days90 + totals.older;

  const columns = useMemo<ColDef<PayableRow>[]>(
    () => [
      { field: 'supplierName', headerName: 'Supplier', minWidth: 200 },
      { field: 'phone', headerName: 'Phone', maxWidth: 140 },
      {
        field: 'paymentTermDays',
        headerName: 'Terms',
        maxWidth: 100,
        valueFormatter: (p) => (Number(p.value) > 0 ? `${p.value} d` : 'On sight'),
      },
      {
        field: 'oldestBillDate',
        headerName: 'Oldest bill',
        maxWidth: 130,
        valueFormatter: (p) => (p.value ? new Date(p.value as string).toLocaleDateString() : '—'),
      },
      {
        field: 'current',
        headerName: 'Not due',
        maxWidth: 130,
        type: 'rightAligned',
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'days30',
        headerName: '1–30 d',
        maxWidth: 120,
        type: 'rightAligned',
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'days60',
        headerName: '31–60 d',
        maxWidth: 120,
        type: 'rightAligned',
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'days90',
        headerName: '61–90 d',
        maxWidth: 120,
        type: 'rightAligned',
        valueFormatter: (p) => money(p.value as number),
      },
      {
        field: 'older',
        headerName: '90+ d',
        maxWidth: 120,
        type: 'rightAligned',
        cellRenderer: (p: ICellRendererParams<PayableRow>) =>
          Number(p.value) > 0 ? (
            <Chip label={money(Number(p.value))} size="small" color="error" />
          ) : (
            money(Number(p.value ?? 0))
          ),
      },
      {
        field: 'creditAvailable',
        headerName: 'Credit',
        maxWidth: 120,
        type: 'rightAligned',
        cellRenderer: (p: ICellRendererParams<PayableRow>) =>
          Number(p.value) > 0 ? (
            <Tooltip title="Unspent debit notes — this much will not be paid in cash">
              <Chip label={money(Number(p.value))} size="small" color="success" />
            </Tooltip>
          ) : (
            <span>—</span>
          ),
      },
      {
        field: 'balanceAmount',
        headerName: 'Payable',
        maxWidth: 150,
        type: 'rightAligned',
        cellStyle: { fontWeight: 600 },
        valueFormatter: (p) => money(p.value as number),
      },
      {
        headerName: '',
        maxWidth: 70,
        cellRenderer: (p: ICellRendererParams<PayableRow>) =>
          p.data ? (
            <Tooltip title="Statement">
              <IconButton
                size="small"
                onClick={() => navigate(`/supplier-ledger?supplierId=${p.data!.supplierId}`)}
              >
                <ReceiptLongIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null,
      },
    ],
    [navigate],
  );

  return (
    <PageContainer
      title="Payables"
      subtitle="What you owe each supplier, aged from the date each bill fell due."
      actions={
        <Stack direction="row" spacing={1}>
          <TextField
            select
            label="Branch"
            size="small"
            fullWidth={false}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            sx={{ width: 190 }}
          >
            <MenuItem value="">All branches</MenuItem>
            {(branches.data ?? []).map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            startIcon={<TableViewIcon />}
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                `payables-${new Date().toISOString().slice(0, 10)}.csv`,
                [
                  'Supplier',
                  'Phone',
                  'Terms (days)',
                  'Oldest bill',
                  'Not due',
                  '1-30 d',
                  '31-60 d',
                  '61-90 d',
                  '90+ d',
                  'Credit available',
                  'Payable',
                ],
                rows.map((row) => [
                  row.supplierName,
                  row.phone ?? '',
                  row.paymentTermDays,
                  row.oldestBillDate ? new Date(row.oldestBillDate).toLocaleDateString() : '',
                  row.current,
                  row.days30,
                  row.days60,
                  row.days90,
                  row.older,
                  row.creditAvailable,
                  row.balanceAmount,
                ]),
              )
            }
          >
            CSV
          </Button>
        </Stack>
      }
    >
      <Stack spacing={1}>
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
            <Figure label="Suppliers" value={String(totals.suppliers)} />
            <Figure label="Not due" value={rupees(totals.current)} />
            <Figure label="Overdue" value={rupees(overdue)} error={overdue > 0} />
            {totals.credit > 0 && (
              <Tooltip title="Unspent debit notes across all suppliers">
                <span>
                  <Figure label="Credit in hand" value={rupees(totals.credit)} />
                </span>
              </Tooltip>
            )}
            <Figure label="Total payable" value={rupees(totals.balance)} bold />
          </Stack>
        </Paper>

        <DataTable
          rows={rows}
          columns={columns}
          loading={payables.isFetching}
          height={600}
        />

        <Typography variant="caption" color="text.secondary">
          Posted bills only, less what has been paid. A bill with no due date was payable on
          sight, so it ages from its own date. Credit shown is unspent debit notes — money you
          are owed back, which reduces the cash you actually have to find.
        </Typography>
      </Stack>
    </PageContainer>
  );
}

function Figure({
  label,
  value,
  bold = false,
  error = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  error?: boolean;
}): JSX.Element {
  return (
    <Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant={bold ? 'h6' : 'body1'}
        fontWeight={bold ? 700 : 500}
        color={error ? 'error.main' : undefined}
      >
        {value}
      </Typography>
    </Stack>
  );
}
