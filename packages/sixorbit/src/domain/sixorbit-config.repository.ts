import type { SixOrbitConfigItem, UUID } from '@tiles-erp/shared-types';

export const SIXORBIT_CONFIG_REPOSITORY = Symbol('SIXORBIT_CONFIG_REPOSITORY');

/**
 * The active configuration with the password already decrypted.
 *
 * Only ever produced inside the infrastructure layer and handed straight to the client.
 * It must not be returned from a controller — {@link SixOrbitConfigItem} is the shape the
 * outside world is allowed to see, and it has no password field at all.
 */
export interface SixOrbitCredentials {
  id: UUID;
  baseUrl: string;
  apiKey: string;
  email: string;
  password: string;
  requestTimeoutMs: number;
}

/** A stored session, as persisted alongside the credentials. */
export interface SixOrbitStoredToken {
  accessToken: string;
  tokenUserId: string;
  tokenFetchedAt: Date;
}

export interface SaveSixOrbitConfigData {
  baseUrl: string;
  apiKey: string;
  email: string;
  /** Undefined leaves the stored password untouched. */
  password?: string;
  requestTimeoutMs: number;
  isActive: boolean;
  notes: string | null;
  version?: number;
}

/** Port for SixOrbit connection-detail persistence. */
export interface SixOrbitConfigRepository {
  /**
   * The stored row as the settings screen sees it — never includes the password.
   *
   * Returns the row whether or not it is active, so that switching the integration off
   * does not make its own settings disappear from the screen that switched it off.
   */
  findCurrent(): Promise<SixOrbitConfigItem | null>;
  /** Create the active row or update it in place. */
  save(data: SaveSixOrbitConfigData, actorId: UUID): Promise<SixOrbitConfigItem>;
  /** The active row with its password decrypted, or null when unconfigured. */
  findActiveCredentials(): Promise<SixOrbitCredentials | null>;
  /** The last session persisted for a config, used to warm a cold Redis. */
  findStoredToken(configId: UUID): Promise<SixOrbitStoredToken | null>;
  saveToken(configId: UUID, token: SixOrbitStoredToken): Promise<void>;
  clearToken(configId: UUID): Promise<void>;
}
