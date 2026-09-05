/**
 * The two things this package needs from its host application.
 *
 * The API and the worker are separate Nest applications, and a BullMQ job is consumed in
 * the worker while the same client is called inline from the API. Rather than duplicate
 * five hundred lines of client so both can have one, the client lives here as plain
 * classes and each app supplies these two adapters.
 *
 * Keeping them this small is the point: anything richer would drag a framework in behind
 * it, which is exactly what this package exists to avoid.
 */

/** Just enough logging surface for the client's two diagnostic messages. */
export interface SixOrbitLogger {
  warn(message: string): void;
  error(message: string): void;
}

/** A logger that discards everything, for tests and for callers that do not care. */
export const silentSixOrbitLogger: SixOrbitLogger = {
  warn: () => undefined,
  error: () => undefined,
};

/**
 * The shared session store.
 *
 * Redis in both applications, but expressed as a port so the package never imports an
 * ioredis client of its own — the API already has one and the worker has its own.
 *
 * `acquireLock` must be atomic across processes (SET NX PX, or equivalent). Without that
 * guarantee the API and the worker can log in simultaneously, and SixOrbit issues one
 * session per user, so the second login can invalidate the first.
 */
export interface SixOrbitCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** True when this caller now holds the lock. */
  acquireLock(key: string, ttlMs: number): Promise<boolean>;
}
