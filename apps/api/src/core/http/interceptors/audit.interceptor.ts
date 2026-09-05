import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Request } from 'express';
import { tap, type Observable } from 'rxjs';
import { QUEUE_NAMES } from '@tiles-erp/config';
import type { AuditJobData, AuthenticatedUser } from '@tiles-erp/shared-types';

const AUDITED_METHODS: Record<string, string> = {
  POST: 'created',
  PATCH: 'updated',
  PUT: 'updated',
  DELETE: 'deleted',
};

const SKIPPED_PREFIXES = ['auth', 'health'];
const SENSITIVE_KEY = /password|token|secret/i;

function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    clean[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : value;
  }
  return clean;
}

/**
 * Captures every successful mutating request as an audit event on the `audit` queue.
 * The worker persists the events, so request latency is unaffected. Auth and health
 * routes are excluded; sensitive fields are redacted.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@InjectQueue(QUEUE_NAMES.AUDIT) private readonly auditQueue: Queue<AuditJobData>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const action = AUDITED_METHODS[request.method];
    if (!action) return next.handle();

    // Path shape: /<prefix>/<entity>/... — derive entity from the segment after the prefix.
    const segments = request.path.split('/').filter(Boolean);
    const entity = segments[1] ?? segments[0] ?? 'unknown';
    if (SKIPPED_PREFIXES.includes(entity)) return next.handle();

    return next.handle().pipe(
      tap((result) => {
        const resultId =
          result && typeof result === 'object' && 'id' in (result as Record<string, unknown>)
            ? String((result as Record<string, unknown>).id)
            : undefined;
        const paramId = (request.params as Record<string, string | undefined>).id;
        const job: AuditJobData = {
          entity,
          entityId: paramId ?? resultId ?? '-',
          action,
          userId: request.user?.id ?? null,
          changes: sanitize(request.body),
        };
        void this.auditQueue.add('record', job).catch(() => {
          /* auditing must never break the request */
        });
      }),
    );
  }
}
