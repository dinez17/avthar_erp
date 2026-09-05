import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { env } from '../config/env';
import { tokenStorage } from '../lib/api-client';
import { authApi, type Credentials } from './auth-store';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Holds the authenticated principal, restores the session on load and exposes auth actions. */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(() =>
    Boolean(tokenStorage.getAccess()),
  );

  useEffect(() => {
    let cancelled = false;
    if (tokenStorage.getAccess()) {
      authApi
        .me()
        .then((me) => {
          if (!cancelled) setUser(me);
        })
        .catch(() => {
          tokenStorage.clear();
        })
        .finally(() => {
          if (!cancelled) setIsInitializing(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials: Credentials) => {
    await authApi.login(credentials);
    setUser(await authApi.me());
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: env.authBypass || user !== null,
      isInitializing,
      login,
      logout,
      hasPermission: (permission) =>
        user !== null &&
        (user.roles.includes('SUPER_ADMIN') || user.permissions.includes(permission)),
    }),
    [user, isInitializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
