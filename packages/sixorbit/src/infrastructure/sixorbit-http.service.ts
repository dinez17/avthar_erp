import type { SixOrbitDirection, SixOrbitEntityType } from '@tiles-erp/shared-types';
import { parseSixOrbitBody, type SixOrbitOutcome } from '../domain/sixorbit-envelope';
import { SIXORBIT_URLQ, type SixOrbitTaskSpec } from '../domain/sixorbit-task';
import {
  buildSixOrbitUrl,
  describeSixOrbitRequest,
  redactSecretsInText,
  type SixOrbitParams,
} from '../domain/sixorbit-url';
import type { SixOrbitSyncLogRepository } from '../domain/sixorbit-sync-log.repository';
import { silentSixOrbitLogger, type SixOrbitLogger } from '../domain/sixorbit-ports';

/** What the caller wants logged against this attempt. */
export interface SixOrbitLogContext {
  entityType: SixOrbitEntityType;
  entityId?: string | null;
  externalId?: string | null;
  direction: SixOrbitDirection;
  /** 1 for a first try. A retry passes 2, 3 … so the log shows the sequence. */
  attempt?: number;
  jobId?: string | null;
}

export interface SixOrbitRequest {
  spec: SixOrbitTaskSpec;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  /** Task-specific query parameters. */
  params?: SixOrbitParams;
  /** Appended when the task is authenticated. */
  auth?: { userId: string; accessToken: string };
  /** JSON payload for the single `data` multipart field on POST tasks. */
  data?: unknown;
  log: SixOrbitLogContext;
}

/**
 * The transport layer, and the only place an HTTP request to SixOrbit is made.
 *
 * It knows nothing about sessions — that would make it circular with the auth service,
 * which has to call `login` through here to obtain one in the first place. It takes a
 * token if it is given one and otherwise sends the request unauthenticated.
 *
 * Every attempt is written to the sync log **here**, not by callers. Logging that depends
 * on each caller remembering to log is logging that is missing exactly when it matters.
 */
export class SixOrbitHttpService {
  constructor(
    private readonly syncLog: SixOrbitSyncLogRepository,
    private readonly logger: SixOrbitLogger = silentSixOrbitLogger,
  ) {}

  async execute<T>(request: SixOrbitRequest): Promise<SixOrbitOutcome<T>> {
    const { spec, baseUrl, apiKey, timeoutMs, params, auth, data, log } = request;

    const allParams: SixOrbitParams = {
      urlq: SIXORBIT_URLQ,
      version: spec.version,
      key: apiKey,
      task: spec.task,
      ...(spec.authenticated && auth
        ? { user_id: auth.userId, access_token: auth.accessToken }
        : {}),
      ...(params ?? {}),
    };

    const url = buildSixOrbitUrl(baseUrl, allParams);
    const requestSummary = describeSixOrbitRequest(allParams);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    let outcome: SixOrbitOutcome<T>;
    let rawBody: string | null = null;
    // Captured for the log rather than rebuilt there: what was sent is the one thing a
    // rejected write cannot be diagnosed without, and their error text names a field
    // without ever quoting the value it objected to.
    let sentBody: string | null = null;

    try {
      const init: RequestInit = { method: spec.method, signal: controller.signal };

      if (spec.method === 'POST') {
        // Their POSTs carry one multipart field called `data` holding a JSON string —
        // an object for customer tasks, a one-element array for variation tasks. The
        // shape is not interchangeable, so it comes from the task registry.
        const payload = spec.bodyShape === 'array' && !Array.isArray(data) ? [data] : data;
        sentBody = JSON.stringify(payload ?? {});
        const form = new FormData();
        form.append('data', sentBody);
        init.body = form;
      }

      const response = await fetch(url, init);
      rawBody = await response.text();

      // A redirected POST has silently lost its body.
      //
      // Per the fetch specification a 302 turns a POST into a GET and drops the payload,
      // so SixOrbit would have received the task with no `data` field at all — and their
      // API answers that with an ordinary-looking validation failure rather than anything
      // that says "your body vanished". Caught here because a customer that silently fails
      // to save is far worse than one that fails loudly.
      //
      // The usual cause is a base URL that does not match what the tenant serves, since
      // their server also redirects to a canonical parameter order (which is why the URL
      // builder sorts and prunes before we get here).
      if (spec.method === 'POST' && response.redirected) {
        outcome = {
          ok: false,
          kind: 'TRANSPORT',
          resultCode: null,
          message: `The request was redirected to ${response.url.split('?')[0] ?? 'another address'}, which drops the body of a POST. Check the base URL in Settings → SixOrbit matches what the tenant serves.`,
        };
      } else {
        outcome = parseSixOrbitBody<T>(rawBody);
      }

      // A transport-shaped failure on a non-200 is worth naming: "not JSON" is confusing
      // when the real story is that their gateway returned a 502.
      if (!outcome.ok && outcome.kind === 'TRANSPORT' && !response.ok) {
        outcome = {
          ...outcome,
          message: `SixOrbit returned HTTP ${response.status}. ${outcome.message}`,
        };
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      outcome = {
        ok: false,
        kind: 'TRANSPORT',
        resultCode: null,
        message: aborted
          ? `SixOrbit did not respond within ${timeoutMs}ms.`
          : `Could not reach SixOrbit: ${redactSecretsInText(
              error instanceof Error ? error.message : String(error),
            )}`,
      };
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - startedAt;

    // Logging must never be the reason a sync fails, so a log write that blows up is
    // reported and swallowed rather than replacing the real outcome.
    try {
      await this.syncLog.record({
        entityType: log.entityType,
        entityId: log.entityId ?? null,
        externalId: log.externalId ?? null,
        task: spec.task,
        direction: log.direction,
        attempt: log.attempt ?? 1,
        success: outcome.ok,
        resultCode: outcome.resultCode,
        message: outcome.message,
        requestSummary,
        requestBody: sentBody ? redactSecretsInText(sentBody) : null,
        responseBody: rawBody ? redactSecretsInText(rawBody) : null,
        durationMs,
        jobId: log.jobId ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write SixOrbit sync log for ${spec.task}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return outcome;
  }
}
