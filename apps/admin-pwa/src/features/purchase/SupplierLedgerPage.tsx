import PrintIcon from '@mui/icons-material/Print';
import TableViewIcon from '@mui/icons-material/TableView';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { endOfDayIso, startOfDayIso } from '@tiles-erp/shared';
import { PageContainer } from '@tiles-erp/ui';
import type { PartyItem, SupplierLedgerEntryType } from '@tiles-erp/shared-types';
import { downloadCsv } from '../../lib/download';
import { useSuppliers } from './api';
import { useSupplierLedger } from './supplier-payments-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rupees = (value: number): string => `₹${money(value)}`;

/** Both date boxes start on today; everything earlier folds into the opening balance. */
const today = (): string => new Date().toISOString().slice(0, 10);

const ENTRY_COLORS: Record<SupplierLedgerEntryType, 'default' | 'error' | 'success' | 'info'> = {
  OPENING: 'default',
  // A bill increases what you owe, a return and a payment reduce it.
  INVOICE: 'error',
  RETURN: 'info',
  PAYMENT: 'success',
};

/**
 * One supplier's statement.
 *
 * The signs are the reverse of a customer's, because a supplier is a creditor: their
 * bills credit the account and what you pay debits it. A positive balance is money you
 * owe them.
 */
export function SupplierLedgerPage(): JSX.Element {
  const suppliers = useSuppliers();
  // The payables report links straight to a supplier's statement.
  const [searchParams] = useSearchParams();
  const [supplierId, setSupplierId] = useState(searchParams.get('supplierId') ?? '');
  const supplierList = suppliers.data ?? [];
  const selected = supplierList.find((supplier) => supplier.id === supplierId) ?? null;
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const ledger = useSupplierLedger(
    supplierId || null,
    from ? startOfDayIso(from) : undefined,
    // To the end of the day, so a bill entered today shows on a statement dated today.
    to ? endOfDayIso(to) : undefined,
  );

  return (
    <PageContainer
      title="Supplier ledger"
      subtitle="A supplier's statement: what they billed, what you returned, what you paid."
      actions={
        <Stack direction="row" spacing={1}>
          <Autocomplete
            size="small"
            options={supplierList}
            value={selected}
            onChange={(_, supplier) => setSupplierId(supplier?.id ?? '')}
            getOptionLabel={(supplier) =>
              supplier.phone ? `${supplier.name} · ${supplier.phone}` : supplier.name
            }
            isOptionEqualToValue={(option, value) => option.id === value.id}
            filterOptions={(options, state) => {
              const needle = state.inputValue.trim().toLowerCase();
              if (!needle) return options;
              return options.filter((supplier) =>
                [supplier.name, supplier.code, supplier.phone ?? '']
                  .join(' ')
                  .toLowerCase()
                  .includes(needle),
              );
            }}
            renderOption={(props, supplier) => (
              <SupplierOption key={supplier.id} props={props} supplier={supplier} />
            )}
            renderInput={(params) => (
              <TextField {...params} label="Supplier" placeholder="Name or phone" />
            )}
            sx={{ width: 300 }}
          />
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
            disabled={!ledger.data}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </Stack>
      }
    >
      {!supplierId && <Alert severity="info">Choose a supplier to see their statement.</Alert>}

      {supplierId && ledger.data && (
        <Stack spacing={1.5}>
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Stack
              direction="row"
              spacing={4}
              flexWrap="wrap"
              useFlexGap
              alignItems="center"
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                <Figure label="Opening" value={ledger.data.openingBalance} />
                <Figure label="Billed" value={ledger.data.totalCredit} />
                <Figure label="Paid & returned" value={ledger.data.totalDebit} />
                <Figure label="Closing" value={ledger.data.closingBalance} bold />
              </Stack>
              <Button
                className="print-hidden"
                size="small"
                startIcon={<TableViewIcon />}
                onClick={() =>
                  downloadCsv(
                    `supplier-ledger-${ledger.data!.supplierName}-${to}.csv`,
                    ['Date', 'Type', 'Reference', 'Particulars', 'Debit', 'Credit', 'Balance'],
                    ledger.data!.entries.map((entry) => [
                      new Date(entry.date).toLocaleDateString('en-IN'),
                      entry.type,
                      entry.reference,
                      entry.particulars,
                      entry.debit || '',
                      entry.credit || '',
                      entry.balance,
                    ]),
                  )
                }
              >
                CSV
              </Button>
            </Stack>
          </Paper>

          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Particulars</TableCell>
                  <TableCell align="right">Debit</TableCell>
                  <TableCell align="right">Credit</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledger.data.entries.map((entry, index) => (
                  <TableRow key={`${entry.reference}-${index}`} hover>
                    <TableCell>{new Date(entry.date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>
                      <Chip label={entry.type} size="small" color={ENTRY_COLORS[entry.type]} />
                    </TableCell>
                    <TableCell>{entry.reference}</TableCell>
                    <TableCell>{entry.particulars}</TableCell>
                    <TableCell align="right">{entry.debit ? money(entry.debit) : ''}</TableCell>
                    <TableCell align="right">{entry.credit ? money(entry.credit) : ''}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {money(entry.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          <Typography variant="caption" color="text.secondary">
            A positive balance is money you owe. Their bills credit the account; your payments
            and the goods you send back debit it. A debit note appears once, as the note itself —
            spending it on a payment is not a second entry, or the same credit would count twice.
            Anything before the From date folds into the opening balance.
          </Typography>
        </Stack>
      )}
    </PageContainer>
  );
}

/** Name on top, code and phone underneath — how a supplier is identified on the phone. */
function SupplierOption({
  props,
  supplier,
}: {
  props: React.HTMLAttributes<HTMLLIElement>;
  supplier: PartyItem;
}): JSX.Element {
  return (
    <Box component="li" {...props}>
      <Stack>
        <Typography variant="body2">{supplier.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {[supplier.code, supplier.phone].filter(Boolean).join(' · ')}
        </Typography>
      </Stack>
    </Box>
  );
}

function Figure({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
}): JSX.Element {
  return (
    <Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant={bold ? 'h6' : 'body1'} fontWeight={bold ? 700 : 500}>
        {rupees(value)}
      </Typography>
    </Stack>
  );
}
