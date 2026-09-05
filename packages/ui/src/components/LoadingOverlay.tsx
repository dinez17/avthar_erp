import { Backdrop, CircularProgress } from '@mui/material';

export interface LoadingOverlayProps {
  open: boolean;
}

/** Full-surface loading indicator for route transitions and blocking mutations. */
export function LoadingOverlay({ open }: LoadingOverlayProps): JSX.Element {
  return (
    <Backdrop open={open} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}>
      <CircularProgress color="inherit" />
    </Backdrop>
  );
}
