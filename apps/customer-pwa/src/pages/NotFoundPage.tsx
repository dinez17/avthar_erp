import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export function NotFoundPage(): JSX.Element {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Stack spacing={2} alignItems="center">
        <Typography variant="h2">404</Typography>
        <Typography color="text.secondary">This page could not be found.</Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Back to overview
        </Button>
      </Stack>
    </Box>
  );
}
