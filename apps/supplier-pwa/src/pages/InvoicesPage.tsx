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
import { money, useSupplierInvoices } from '../portal/api';

export function InvoicesPage(): JSX.Element {
  const { activeSupplierId } = usePortal();
  const { data } = useSupplierInvoices(activeSupplierId);
  const rows = data?.items ?? [];

  return (
    <PageContainer title="Invoices" subtitle="Posted purchase invoices" actions={<SupplierSwitcher />}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Invoice no</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Branch</TableCell>
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((inv) => (
            <TableRow key={inv.id} hover>
              <TableCell>{inv.invoiceNumber}</TableCell>
              <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
              <TableCell>{inv.branchName}</TableCell>
              <TableCell align="right">{money(inv.grandTotal)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography variant="body2" color="text.secondary">
                  No invoices yet.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
