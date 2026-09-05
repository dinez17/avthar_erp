import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

export const TRACE_HEADER = 'x-trace-id';

/** Returns a stable trace id for the request, generating one if absent. */
export function getTraceId(request: Request): string {
  const existing = request.headers[TRACE_HEADER];
  if (typeof existing === 'string' && existing.length > 0) return existing;
  const generated = randomUUID();
  request.headers[TRACE_HEADER] = generated;
  return generated;
}
