import { Card, CardContent, Grid, Typography } from '@mui/material';
import { PageContainer } from '@tiles-erp/ui';
import { SupplierSwitcher, usePortal } from '../portal/PortalProvider';
import { money, useSupplierSummary } from '../portal/api';

/** Supplier dashboard: what needs attention and what is owed. */
export function OverviewPage(): JSX.Element {
  const { activeSupplierId } = usePortal();
  const { data } = useSupplierSummary(activeSupplierId);

  const cards = [
    { label: 'Orders to acknowledge', value: String(data?.ordersToAcknowledge ?? 0), highlight: (data?.ordersToAcknowledge ?? 0) > 0 },
    { label: 'Open orders', value: String(data?.openOrders ?? 0) },
    { label: 'Unpaid invoices', value: String(data?.unpaidInvoices ?? 0) },
    { label: 'Outstanding', value: money(data?.outstanding ?? 0) },
  ];

  return (
    <PageContainer
      title="Overview"
      subtitle={data?.supplierName ?? 'Your account'}
      actions={<SupplierSwitcher />}
    >
      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid key={card.label} item xs={12} sm={6} md={3}>
            <Card sx={{ height: '100%', borderTop: card.highlight ? '3px solid' : undefined, borderColor: 'warning.main' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {card.label}
                </Typography>
                <Typography variant="h4">{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </PageContainer>
  );
}
