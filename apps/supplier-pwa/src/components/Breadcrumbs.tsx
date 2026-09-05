import { Breadcrumbs as MuiBreadcrumbs, Link, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';

/** Derives a breadcrumb trail from the current path segments. */
export function Breadcrumbs(): JSX.Element {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <MuiBreadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
      <Link component={RouterLink} to="/" underline="hover" color="inherit">
        Home
      </Link>
      {segments.map((segment, index) => {
        const to = `/${segments.slice(0, index + 1).join('/')}`;
        const label = segment.charAt(0).toUpperCase() + segment.slice(1);
        const isLast = index === segments.length - 1;
        return isLast ? (
          <Typography key={to} color="text.primary">
            {label}
          </Typography>
        ) : (
          <Link key={to} component={RouterLink} to={to} underline="hover" color="inherit">
            {label}
          </Link>
        );
      })}
    </MuiBreadcrumbs>
  );
}
