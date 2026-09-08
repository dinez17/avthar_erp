import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { BrandMark } from '../app/branding';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

/** Centered layout for unauthenticated screens (sign-in and related flows). */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps): JSX.Element {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
          <Stack spacing={1} sx={{ mb: children ? 3 : 0 }}>
            {/* The logo is the first thing that says whose system this is — it
                belongs above the name, not beside it. */}
            <BrandMark size={48} />
            <Typography variant="h5">{title}</Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Stack>
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}
