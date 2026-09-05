import type { ApiResponse, AuthTokens } from '@tiles-erp/shared-types';
import { env } from '../config/env';

const ACCESS_TOKEN_KEY = 'tiles-erp:access-token';
const REFRESH_TOKEN_KEY = 'tiles-erp:refresh-token';

export const tokenStorage = {
  getAccess: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  set: (tokens: { accessToken: string; refreshToken: string }): void => {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },
  clear: (): void => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API base URL in use, surfaced in diagnostics. */
export const apiBaseUrl = env.apiUrl;

/**
 * Performs the request and normalises transport-level failures. A browser fetch
 * rejects (rather than returning a status) when the host is unreachable or the CORS
 * preflight fails, which otherwise surfaces as an opaque "Failed to fetch".
 */
async function requestJson<T>(url: string, init: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    // A self-signed certificate is rejected for background requests until the browser
    // has been shown the API origin directly, so call that out explicitly.
    const needsCertTrust = env.apiUrl.startsWith('https://');
    throw new ApiError(
      needsCertTrust
        ? `Cannot reach the server at ${env.apiUrl}. If the API uses a self-signed certificate, open ${env.apiUrl}/docs in a tab and accept the warning once, then retry. Otherwise check that the API is running in HTTPS mode.`
        : `Cannot reach the server at ${env.apiUrl}. Check that the API is running and reachable from this device.`,
      0,
      'NETWORK_UNREACHABLE',
    );
  }

  const text = await response.text();
  if (!text) {
    throw new ApiError(
      `The server returned an empty response (HTTP ${response.status}).`,
      response.status,
      'EMPTY_RESPONSE',
    );
  }
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      `Unexpected response from ${env.apiUrl} (HTTP ${response.status}). This usually means the API URL is pointing at the wrong service.`,
      response.status,
      'INVALID_RESPONSE',
    );
  }
}

let refreshPromise: Promise<boolean> | null = null;

/** Attempts a one-shot refresh-token rotation. Returns true when a new pair was stored. */
async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = tokenStorage.getRefresh();
    if (!refreshToken) return false;
    try {
      const body = await requestJson<AuthTokens>(`${env.apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!body.success) return false;
      tokenStorage.set(body.data);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function rawFetch<T>(path: string, init: RequestInit): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = tokenStorage.getAccess();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return requestJson<T>(`${env.apiUrl}${path}`, { ...init, headers });
}

/**
 * Fetch wrapper that unwraps the standard API envelope, injects the bearer token and
 * transparently rotates the token pair once when the access token has expired.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let body = await rawFetch<T>(path, init);
  if (!body.success && body.statusCode === 401 && !path.startsWith('/auth/')) {
    if (await tryRefresh()) {
      body = await rawFetch<T>(path, init);
    }
  }
  if (!body.success) {
    if (body.statusCode === 401) tokenStorage.clear();
    throw new ApiError(body.message, body.statusCode, body.errorCode);
  }
  return body.data;
}
