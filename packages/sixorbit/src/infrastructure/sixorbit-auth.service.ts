import { CACHE } from '@tiles-erp/config';

import type {
  SixOrbitConfigRepository,
  SixOrbitCredentials,
} from '../domain/sixorbit-config.repository';
import { SIXORBIT_APP_FLAG, SIXORBIT_TASKS } from '../domain/sixorbit-task';
import {
  silentSixOrbitLogger,
  type SixOrbitCache,
  type SixOrbitLogger,
} from '../domain/sixorbit-ports';
import { SixOrbitApiError, SixOrbitNotConfiguredError } from '../domain/sixorbit.errors';
import { type SixOrbitHttpService } from './sixorbit-http.service';

/**
 * The fields we read from their login response.
 *
 * Their payload is enormous — the full permission list runs to nearly two thousand
 * entries — so only what is actually used is typed. Everything is a string on their side,
 * including numeric ids, and `access_token` exceeds the safe integer range, so nothing
 * here is ever parsed to a number.
 */
export interface SixOrbitLoginData {
  access_token?: string;
  user_id?: string;
  user_name?: string;
  company_code?: string;
  company_name?: string;
  user_outlet?: { Id?: string; code?: string; name?: string };
}

/** An authenticated session, as everything downstream needs it. */
export interface SixOrbitSession {
  userId: string;
  accessToken: string;
  credentials: SixOrbitCredentials;
}

/**
 * How long a cached session is trusted before we log in again.
 *
 * SixOrbit publishes no expiry. Observation says the token is stable — the same one
 * worked hours later and did not rotate between calls — so this is a refresh cadence
 * rather than a real TTL. An hour keeps the token fresh without turning login into a
 * per-request cost, and a token that expires sooner is caught by the AUTH retry anyway.
 */
const TOKEN_TTL_SECONDS = 3600;

/** How long the login lock is held, and how long a loser waits for the winner. */
const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 150;

interface CachedSession {
  userId: string;
  accessToken: string;
}

/**
 * Obtains and caches the single SixOrbit session shared by the API and the worker.
 *
 * Their login issues a session per user, and this integration authenticates as one user.
 * Two processes logging in independently therefore risks one invalidating the other's
 * token — so exactly one logs in at a time, behind a Redis lock, and everyone else reads
 * the result. Redis is the hot copy; the token is also persisted so that a Redis restart
 * does not force a fresh login.
 */
export class SixOrbitAuthService {
  constructor(
    private readonly http: SixOrbitHttpService,
    private readonly cache: SixOrbitCache,
    private readonly configRepo: SixOrbitConfigRepository,
    private readonly logger: SixOrbitLogger = silentSixOrbitLogger,
  ) {}

  /** The active credentials, or a clear error explaining that none are configured. */
  async requireCredentials(): Promise<SixOrbitCredentials> {
    const credentials = await this.configRepo.findActiveCredentials();
    if (!credentials) throw new SixOrbitNotConfiguredError();
    return credentials;
  }

  /** A usable session, logging in only if there isn't one already. */
  async getSession(): Promise<SixOrbitSession> {
    const credentials = await this.requireCredentials();

    const cached = await this.cache.get<CachedSession>(CACHE.keys.sixorbitToken(credentials.id));
    if (cached) return { ...cached, credentials };

    // Redis may have been flushed while the session is still perfectly good.
    const stored = await this.configRepo.findStoredToken(credentials.id);
    if (stored && Date.now() - stored.tokenFetchedAt.getTime() < TOKEN_TTL_SECONDS * 1000) {
      const session = { userId: stored.tokenUserId, accessToken: stored.accessToken };
      await this.rememberSession(credentials.id, session);
      return { ...session, credentials };
    }

    return this.loginOnce(credentials);
  }

  /**
   * Throws the current session away.
   *
   * Called when SixOrbit rejects a token, so the next call logs in rather than retrying
   * with the credential that was just refused.
   */
  async invalidate(): Promise<void> {
    const credentials = await this.configRepo.findActiveCredentials();
    if (!credentials) return;
    await this.cache.del(CACHE.keys.sixorbitToken(credentials.id));
    await this.configRepo.clearToken(credentials.id);
  }

  /**
   * Logs in with the given credentials without touching the cache.
   *
   * This is what "Test connection" uses: someone checking a password they have just typed
   * wants it tried, not compared against a session obtained an hour ago.
   */
  async login(credentials: SixOrbitCredentials): Promise<SixOrbitLoginData> {
    const outcome = await this.http.execute<SixOrbitLoginData>({
      spec: SIXORBIT_TASKS.LOGIN,
      baseUrl: credentials.baseUrl,
      apiKey: credentials.apiKey,
      timeoutMs: credentials.requestTimeoutMs,
      params: {
        email: credentials.email,
        password: credentials.password,
        app_flag: SIXORBIT_APP_FLAG,
      },
      log: { entityType: 'CONNECTION', direction: 'PUSH' },
    });

    if (!outcome.ok) {
      throw new SixOrbitApiError(outcome.message, outcome.kind, outcome.resultCode);
    }

    const data = outcome.data;
    if (!data?.access_token || !data.user_id) {
      // Their envelope said success but gave us nothing to authenticate with. Treating
      // that as success would produce a session that fails on every subsequent call.
      throw new SixOrbitApiError(
        'SixOrbit accepted the login but returned no access token.',
        'UNKNOWN',
        outcome.resultCode,
      );
    }
    return data;
  }

  /** Logs in behind the shared lock, deferring to whoever got there first. */
  private async loginOnce(credentials: SixOrbitCredentials): Promise<SixOrbitSession> {
    const lockKey = CACHE.keys.sixorbitTokenLock(credentials.id);
    const acquired = await this.cache.acquireLock(lockKey, LOCK_TTL_MS);

    if (!acquired) {
      const waited = await this.waitForSession(credentials.id);
      if (waited) return { ...waited, credentials };
      // The holder died or is slow. Logging in anyway is better than failing the request:
      // the worst case is one redundant login, which their API tolerates.
      this.logger.warn('Timed out waiting for another process to log in to SixOrbit.');
    }

    try {
      const data = await this.login(credentials);
      const session: CachedSession = {
        userId: data.user_id as string,
        accessToken: data.access_token as string,
      };
      await this.rememberSession(credentials.id, session);
      await this.configRepo.saveToken(credentials.id, {
        accessToken: session.accessToken,
        tokenUserId: session.userId,
        tokenFetchedAt: new Date(),
      });
      return { ...session, credentials };
    } finally {
      if (acquired) await this.cache.del(lockKey);
    }
  }

  private async waitForSession(configId: string): Promise<CachedSession | null> {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
      const cached = await this.cache.get<CachedSession>(CACHE.keys.sixorbitToken(configId));
      if (cached) return cached;
    }
    return null;
  }

  private rememberSession(configId: string, session: CachedSession): Promise<void> {
    return this.cache.set(CACHE.keys.sixorbitToken(configId), session, TOKEN_TTL_SECONDS);
  }
}
