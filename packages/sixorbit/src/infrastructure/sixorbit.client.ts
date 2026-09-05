import type { SixOrbitOutcome } from '../domain/sixorbit-envelope';
import type { SixOrbitTaskSpec } from '../domain/sixorbit-task';
import type { SixOrbitParams } from '../domain/sixorbit-url';
import { SixOrbitApiError } from '../domain/sixorbit.errors';
import { silentSixOrbitLogger, type SixOrbitLogger } from '../domain/sixorbit-ports';
import { type SixOrbitAuthService } from './sixorbit-auth.service';
import { type SixOrbitHttpService, type SixOrbitLogContext } from './sixorbit-http.service';

export interface SixOrbitCallOptions {
  spec: SixOrbitTaskSpec;
  params?: SixOrbitParams;
  data?: unknown;
  log: SixOrbitLogContext;
}

/**
 * The one door every later sprint knocks on.
 *
 * It adds two things to the raw transport: the session, and a single retry when SixOrbit
 * rejects that session. One retry, not a loop — if a fresh login is also refused, the
 * credentials are wrong and hammering their endpoint with them is how an account gets
 * locked out.
 *
 * Whether a *transport* failure is retried is not decided here. That belongs to the queue,
 * which can wait and back off; a controller handling a user's click should fail fast and
 * say so.
 */
export class SixOrbitClient {
  constructor(
    private readonly http: SixOrbitHttpService,
    private readonly auth: SixOrbitAuthService,
    private readonly logger: SixOrbitLogger = silentSixOrbitLogger,
  ) {}

  /** Calls a task and returns the outcome, leaving failure handling to the caller. */
  async call<T>(options: SixOrbitCallOptions): Promise<SixOrbitOutcome<T>> {
    const session = await this.auth.getSession();

    const first = await this.http.execute<T>({
      spec: options.spec,
      baseUrl: session.credentials.baseUrl,
      apiKey: session.credentials.apiKey,
      timeoutMs: session.credentials.requestTimeoutMs,
      params: options.params,
      auth: { userId: session.userId, accessToken: session.accessToken },
      data: options.data,
      log: options.log,
    });

    if (first.ok || first.kind !== 'AUTH') return first;

    this.logger.warn(
      `SixOrbit rejected the session on ${options.spec.task}; logging in again and retrying once.`,
    );
    await this.auth.invalidate();
    const renewed = await this.auth.getSession();

    return this.http.execute<T>({
      spec: options.spec,
      baseUrl: renewed.credentials.baseUrl,
      apiKey: renewed.credentials.apiKey,
      timeoutMs: renewed.credentials.requestTimeoutMs,
      params: options.params,
      auth: { userId: renewed.userId, accessToken: renewed.accessToken },
      data: options.data,
      log: { ...options.log, attempt: (options.log.attempt ?? 1) + 1 },
    });
  }

  /**
   * Calls a task and throws unless it succeeded.
   *
   * The convenient form for code that has no useful way to handle a failure itself. The
   * thrown error carries the failure kind, so a queue processor can still decide whether
   * another attempt is worth making.
   */
  async callOrThrow<T>(options: SixOrbitCallOptions): Promise<T> {
    const outcome = await this.call<T>(options);
    if (!outcome.ok) {
      throw new SixOrbitApiError(outcome.message, outcome.kind, outcome.resultCode);
    }
    return outcome.data;
  }
}
