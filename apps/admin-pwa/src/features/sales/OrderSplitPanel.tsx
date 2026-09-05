import CallSplitIcon from '@mui/icons-material/CallSplit';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import ReceiptIcon from '@mui/icons-material/Receipt';
import {
  Alert,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api-client';
import { useSplitInvoices, useSplitPlan } from './orders-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface OrderSplitPanelProps {
  salesOrderId: string;
  onInvoiced: (message: string) => void;
}

/**
 * How a confirmed order will invoice: one row per supplying branch, one invoice each.
 *
 * The reason this is worth showing before anything is cut is the tax column. Two
 * branches under two GSTINs make two supplies, so the same order can charge CGST+SGST
 * on one invoice and IGST on another — correct, and alarming if it appears without
 * warning on a printed invoice.
 */
export function OrderSplitPanel({ salesOrderId, onInvoiced }: OrderSplitPanelProps): JSX.Element {
  const navigate = useNavigate();
  const plan = useSplitPlan(salesOrderId);
  const split = useSplitInvoices();
  const [error, setError] = useState<string | null>(null);

  const raise = async (): Promise<void> => {
    setError(null);
    try {
      const result = await split.mutateAsync({ salesOrderId });
      const raised = result.invoices.map((invoice) => invoice.invoiceNumber).join(', ');
      onInvoiced(
        result.invoices.length === 1
          ? `${raised} drafted. Post it to take the stock out.`
          : `${result.invoices.length} drafts raised: ${raised}. Post each one to take its stock out.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The invoices could not be raised');
    }
  };

  if (!plan.data) return <></>;

  const rows = plan.data.rows;
  const uninvoiced = rows.filter((row) => !row.invoiceId);

  return (
    <Stack spacing={1}>
      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle2">Invoice split</Typography>
          {plan.data.isSplit && (
            <Chip
              icon={<CallSplitIcon />}
              label={`${rows.length} branches`}
              size="small"
              color="warning"
            />
          )}
        </Stack>
        <Button
          size="small"
          variant="contained"
          startIcon={<ReceiptIcon />}
          disabled={uninvoiced.length === 0 || split.isPending}
          onClick={() => void raise()}
        >
          {split.isPending
            ? 'Raising…'
            : uninvoiced.length === 1
              ? 'Raise invoice'
              : `Raise ${uninvoiced.length} invoices`}
        </Button>
      </Stack>

      {rows.length === 0 ? (
        <Alert severity="info">
          Nothing is reserved against this order, so there is nothing to invoice.
        </Alert>
      ) : (
        <Table size="small" sx={{ '& td, & th': { py: 0.5 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Branch</TableCell>
              <TableCell align="right">Lines</TableCell>
              <TableCell align="right">Boxes</TableCell>
              <TableCell align="right">Value</TableCell>
              <TableCell>Tax</TableCell>
              <TableCell>Invoice</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.branchId} hover>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    {row.isHomeBranch && (
                      <Tooltip title="The branch that took the order">
                        <HomeWorkIcon fontSize="small" color="action" />
                      </Tooltip>
                    )}
                    <span>{row.branchName}</span>
                  </Stack>
                </TableCell>
                <TableCell align="right">{row.lineCount}</TableCell>
                <TableCell align="right">{row.qtyBoxes}</TableCell>
                <TableCell align="right">{money(row.subTotal)}</TableCell>
                <TableCell>
                  <Chip
                    label={row.interState ? 'IGST' : 'CGST + SGST'}
                    size="small"
                    variant="outlined"
                    color={row.interState ? 'warning' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  {row.invoiceId ? (
                    <Button
                      size="small"
                      onClick={() => navigate(`/sales-invoices?search=${row.invoiceNumber}`)}
                    >
                      {row.invoiceNumber}
                    </Button>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Not yet raised
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {plan.data.isSplit && (
        <Typography variant="caption" color="text.secondary">
          Each branch invoices its own share under its own GSTIN, so the tax is worked out
          against that branch&rsquo;s state — which is why the column above can differ row to
          row. Every invoice still points back at this one order.
        </Typography>
      )}
    </Stack>
  );
}
