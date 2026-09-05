import type { ApiResponse } from '@tiles-erp/shared-types';
import { env } from '../config/env';

const ACCESS_TOKEN_KEY = 'tiles-erp:access-token';

export const tokenStorage = {
  get: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(ACCESS_TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(ACCESS_TOKEN_KEY),
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

/** Thin fetch wrapper that unwraps the standard API envelope and injects the bearer token. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  const body = (await response.json()) as ApiResponse<T>;

  if (!body.success) {
    throw new ApiError(body.message, body.statusCode, body.errorCode);
  }
  return body.data;
}
