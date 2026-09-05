import type { AuthenticatedUser, AuthTokens } from '@tiles-erp/shared-types';
import { apiFetch, tokenStorage } from '../lib/api-client';

export interface Credentials {
  email: string;
  password: string;
}

/** Framework-agnostic authentication operations backed by the API. */
export const authApi = {
  async login(credentials: Credentials): Promise<AuthTokens> {
    const tokens = await apiFetch<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    tokenStorage.set(tokens);
    return tokens;
  },
  async me(): Promise<AuthenticatedUser> {
    return apiFetch<AuthenticatedUser>('/auth/me');
  },
  async logout(): Promise<void> {
    const refreshToken = tokenStorage.getRefresh();
    if (refreshToken) {
      try {
        await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
      } catch {
        /* token already invalid - proceed with local cleanup */
      }
    }
    tokenStorage.clear();
  },
};
