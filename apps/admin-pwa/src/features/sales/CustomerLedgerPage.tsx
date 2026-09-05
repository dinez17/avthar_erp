import {
  Alert,
  Autocomplete,
  Box,
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
import type { LedgerEntryType, PartyItem } from '@tiles-erp/shared-types';
import { useCustomers } from './api';
import { useCustomerLedger } from './receipts-api';

const money = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rupees = (value: number): string => `₹${money(value)}`;

/** Both date boxes start on today; everything earlier folds into the opening balance. */
const today = (): string => new Date().toISOString().slice(0, 10);

const ENTRY_COLORS: Record<LedgerEntryType, 'default' | 'error' | 'success'> = {
  OPENING: 'default',
  INVOICE: 'error',
  RECEIPT: 'success',
};

/**
 * One customer's statement: invoices as debits, receipts as credits, in date order with
 * a running balance. A positive balance is money they owe.
 */
export function CustomerLedgerPage(): JSX.Element {
  const customers = useCustomers();
  // The outstanding report links straight to a customer's statement.
  const [searchParams] = useSearchParams();
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') ?? '');
  const customerList = customers.data ?? [];
  const selected = customerList.find((customer) => customer.id === customerId) ?? null;
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const ledger = useCustomerLedger(
    customerId || null,
    from ? startOfDayIso(from) : undefined,
    // To the end of the day, so today's own invoices show on a statement dated today.
    to ? endOfDayIso(to) : undefined,
  );

  return (
    <PageContainer
      title="Customer ledger"
      subtitle="A customer's statement: what was billed, what was paid, and the running balance."
      actions={
        <Stack direction="row" spacing={1}>
          <Autocomplete
            size="small"
            options={customerList}
            value={selected}
            onChange={(_, customer) => setCustomerId(customer?.id ?? '')}
            getOptionLabel={(customer) =>
              customer.phone ? `${customer.name} · ${customer.phone}` : customer.name
            }
            isOptionEqualToValue={(option, value) => option.id === value.id}
            // Typing matches the name, the code or the phone — whichever the caller quotes.
            filterOptions={(options, state) => {
              const needle = state.inputValue.trim().toLowerCase();
              if (!needle) return options;
              return options.filter((customer) =>
                [customer.name, customer.code, customer.phone ?? '']
                  .join(' ')
                  .toLowerCase()
                  .includes(needle),
              );
            }}
            renderOption={(props, customer) => <CustomerOption key={customer.id} props={props} customer={customer} />}
            renderInput={(params) => (
              <TextField {...params} label="Customer" placeholder="Name or phone" />
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
        </Stack>
      }
    >
      {!customerId && <Alert severity="info">Choose a customer to see their statement.</Alert>}

      {customerId && ledger.data && (
        <Stack spacing={1.5}>
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
              <Figure label="Opening" value={ledger.data.openingBalance} />
              <Figure label="Invoiced" value={ledger.data.totalDebit} />
              <Figure label="Received" value={ledger.data.totalCredit} />
              <Figure label="Closing" value={ledger.data.closingBalance} bold />
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
            A positive balance is money the customer owes. Anything before the From date is folded
            into the opening balance, so today's view opens with what they already owed. Widen the
            dates to see the movements behind it.
          </Typography>
        </Stack>
      )}
    </PageContainer>
  );
}

/** Name on top, phone underneath: the two things a caller identifies themselves by. */
function CustomerOption({
  props,
  customer,
}: {
  props: React.HTMLAttributes<HTMLLIElement>;
  customer: PartyItem;
}): JSX.Element {
  return (
    <Box component="li" {...props}>
      <Stack>
        <Typography variant="body2">{customer.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {[customer.code, customer.phone].filter(Boolean).join(' · ')}
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
