import { toCsv, type CsvValue } from '@tiles-erp/shared';
import { env } from '../config/env';
import { ApiError, tokenStorage } from './api-client';

/** Hands a blob to the browser as a file, then releases the object URL. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Writes rows to a CSV file the user downloads.
 *
 * The BOM matters: without it Excel on Windows reads the file as the local codepage and
 * turns ₹ and Tamil names into mojibake.
 */
export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]): void {
  saveBlob(new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

/**
 * Downloads a file the API generates — a workbook, a PDF — rather than JSON.
 *
 * `apiFetch` cannot be reused here: it parses the body as the standard envelope, which a
 * binary response is not. The bearer token still has to be attached, so the request is
 * made by hand and only the failure path falls back to reading the envelope, since an
 * error from the API is JSON even when the success case is not.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const headers = new Headers();
  const token = tokenStorage.getAccess();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, { headers });
  } catch {
    throw new ApiError(
      `Cannot reach the server at ${env.apiUrl}.`,
      0,
      'NETWORK_UNREACHABLE',
    );
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : `The file could not be generated (HTTP ${response.status}).`;
    throw new ApiError(message, response.status, 'DOWNLOAD_FAILED');
  }

  saveBlob(await response.blob(), filenameFrom(response) ?? fallbackName);
}

/** Prefers the name the server chose, so the period in it stays authoritative. */
function filenameFrom(response: Response): string | null {
  const disposition = response.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}
