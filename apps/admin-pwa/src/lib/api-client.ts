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
  let response: Response | undefined;
  const method = (init.method ?? 'GET').toUpperCase();
  const retryDelays = method === 'GET' ? [0, 500, 1_000, 2_000, 4_000] : [0];
  for (const delay of retryDelays) {
    if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
    try {
      response = await fetch(url, init);
      break;
    } catch {
      // A production container replacement normally lasts only a few seconds. GETs are
      // safe to retry; writes are deliberately attempted once because their outcome can
      // be unknown if the connection drops after the server receives the request.
    }
  }
  if (!response) {
    throw new ApiError(
      `Cannot reach the server at ${env.apiUrl}. Check ${env.apiUrl}/health from this device, then retry.`,
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
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
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
