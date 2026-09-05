import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { PortalProvider } from '../portal/PortalProvider';

/**
 * Route guard for the portal. An unauthenticated visit goes to the sign-in screen; an
 * authenticated one is wrapped in the PortalProvider so every page has the user's supplier
 * context.
 */
export function ProtectedRoute(): JSX.Element {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <PortalProvider>
      <Outlet />
    </PortalProvider>
  );
}
