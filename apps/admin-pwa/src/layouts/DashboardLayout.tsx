import { Box, Toolbar } from '@mui/material';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useMediaQuery } from '@tiles-erp/hooks';
import { Header } from '../components/Header';
import { Sidebar, SIDEBAR_WIDTH } from '../components/Sidebar';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useBranding } from '../app/branding';

/** Authenticated shell: responsive sidebar, header, breadcrumb and routed content. */
export function DashboardLayout(): JSX.Element {
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const [mobileOpen, setMobileOpen] = useState(false);
  // Was a hardcoded 'Tiles ERP Admin', which is why editing app.name did nothing.
  const { appName } = useBranding();

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      <Header
        title={appName}
        isDesktop={isDesktop}
        onMenuClick={() => setMobileOpen(true)}
      />
      <Sidebar
        title={appName}
        isDesktop={isDesktop}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: isDesktop ? `calc(100% - ${SIDEBAR_WIDTH}px)` : '100%',
          p: { xs: 1, md: 1.5 },
        }}
      >
        <Toolbar />
        <Breadcrumbs />
        <Outlet />
      </Box>
    </Box>
  );
}
