import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export interface PageContainerProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Compact page shell: slim title bar, optional actions, minimal padding. */
export function PageContainer({
  title,
  subtitle,
  actions,
  children,
}: PageContainerProps): JSX.Element {
  return (
    <Box sx={{ p: { xs: 1, md: 1.5 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="h6" lineHeight={1.2}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Box>{actions}</Box>}
      </Stack>
      {children}
    </Box>
  );
}
