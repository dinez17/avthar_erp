import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingOverlay } from '@tiles-erp/ui';
import { useAuth } from './AuthProvider';

/** Redirects unauthenticated visitors to the login screen, preserving the target route. */
export function ProtectedRoute(): JSX.Element {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) return <LoadingOverlay open />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
