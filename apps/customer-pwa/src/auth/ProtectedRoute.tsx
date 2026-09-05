import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { AuthLayout } from '../layouts/AuthLayout';

/**
 * Route guard for authenticated areas. Until the login module is installed, an
 * unauthenticated visit renders an informative notice inside the auth layout rather
 * than redirecting to a not-yet-existent login screen.
 */
export function ProtectedRoute(): JSX.Element {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return (
      <AuthLayout
        title="Authentication required"
        subtitle="The sign-in module has not been installed in this build yet."
      />
    );
  }
  return <Outlet />;
}
