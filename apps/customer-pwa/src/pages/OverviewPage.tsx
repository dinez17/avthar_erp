import { Card, CardContent, Grid, Typography } from '@mui/material';
import { PageContainer } from '@tiles-erp/ui';

const FOUNDATION_NOTES = [
  { title: 'Authentication', body: 'JWT access/refresh with rotation and RBAC guards are wired on the API.' },
  { title: 'Offline-ready', body: 'This app is an installable PWA with a service worker and API caching.' },
  { title: 'Modular', body: 'Business modules plug into this shell as they are implemented.' },
];

/** Foundation landing page. Business dashboards and widgets are added with their modules. */
export function OverviewPage(): JSX.Element {
  return (
    <PageContainer title="Customer Portal" subtitle="Foundation build - modules are added incrementally.">
      <Grid container spacing={2}>
        {FOUNDATION_NOTES.map((note) => (
          <Grid key={note.title} item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {note.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {note.body}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </PageContainer>
  );
}
