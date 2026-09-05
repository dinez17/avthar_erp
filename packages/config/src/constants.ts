/** Default pagination behaviour applied across every list endpoint. */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 200,
} as const;

/** Named BullMQ queues. Business modules add their own queue names as needed. */
export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATION: 'notification',
  AUDIT: 'audit',
  /** Outbound and inbound synchronisation with SixOrbit. */
  SIXORBIT: 'sixorbit',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Redis cache key builders and TTLs (seconds). */
export const CACHE = {
  TTL_SHORT: 60,
  TTL_MEDIUM: 300,
  TTL_LONG: 3600,
  keys: {
    userPermissions: (userId: string): string => `perm:user:${userId}`,
    refreshToken: (userId: string, tokenId: string): string => `rt:${userId}:${tokenId}`,
    /**
     * The one SixOrbit session shared by the API and the worker.
     *
     * Deliberately a single key rather than one per process: their login issues a session
     * per user, and two processes logging in independently risks one invalidating the
     * other. Whoever wins the lock logs in; everyone else reads the result.
     */
    sixorbitToken: (configId: string): string => `sixorbit:token:${configId}`,
    sixorbitTokenLock: (configId: string): string => `sixorbit:token-lock:${configId}`,
  },
} as const;

/** Shared validation patterns. */
export const REGEX = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_IN: /^[6-9]\d{9}$/,
  GSTIN: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
  HSN: /^\d{4,8}$/,
} as const;
