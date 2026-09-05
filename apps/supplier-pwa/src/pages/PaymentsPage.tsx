import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { PageContainer } from '@tiles-erp/ui';
import { SupplierSwitcher, usePortal } from '../portal/PortalProvider';
import { money, useSupplierPayments } from '../portal/api';

export function PaymentsPage(): JSX.Element {
  const { activeSupplierId } = usePortal();
  const { data } = useSupplierPayments(activeSupplierId);
  const rows = data?.items ?? [];

  return (
    <PageContainer title="Payments" subtitle="Payments made to you" actions={<SupplierSwitcher />}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Payment no</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Mode</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((pay) => (
            <TableRow key={pay.id} hover>
              <TableCell>{pay.paymentNumber}</TableCell>
              <TableCell>{new Date(pay.paymentDate).toLocaleDateString()}</TableCell>
              <TableCell>{pay.mode}</TableCell>
              <TableCell align="right">{money(pay.amount)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography variant="body2" color="text.secondary">
                  No payments yet.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
