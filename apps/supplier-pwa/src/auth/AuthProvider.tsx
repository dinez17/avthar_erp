import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { env } from '../config/env';
import { tokenStorage } from '../lib/api-client';
import { authApi, type Credentials } from './auth-store';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Frontend authentication foundation. Holds the current principal and exposes login/logout.
 * A dev-only bypass flag lets the shell render before the login module is built.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [token, setToken] = useState<string | null>(() => tokenStorage.get());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: env.authBypass || Boolean(token),
      login: async (credentials) => {
        await authApi.login(credentials);
        setToken(tokenStorage.get());
        setUser(await authApi.me());
      },
      logout: () => {
        authApi.logout();
        setToken(null);
        setUser(null);
      },
    }),
    [user, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
