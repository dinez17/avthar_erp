import type {
  Paginated,
  SixOrbitDirection,
  SixOrbitEntityType,
  SixOrbitSyncHealth,
  SixOrbitSyncLogItem,
  SixOrbitSyncLogQuery,
} from '@tiles-erp/shared-types';

export const SIXORBIT_SYNC_LOG_REPOSITORY = Symbol('SIXORBIT_SYNC_LOG_REPOSITORY');

/** One attempt, as the client records it. */
export interface SixOrbitSyncLogEntry {
  entityType: SixOrbitEntityType;
  entityId?: string | null;
  externalId?: string | null;
  task: string;
  direction: SixOrbitDirection;
  attempt: number;
  success: boolean;
  resultCode?: string | null;
  message?: string | null;
  requestSummary?: string | null;
  /** The JSON posted in their `data` field. Null for a GET. */
  requestBody?: string | null;
  responseBody?: string | null;
  durationMs: number;
  jobId?: string | null;
}

/** Port for the append-only sync log. */
export interface SixOrbitSyncLogRepository {
  record(entry: SixOrbitSyncLogEntry): Promise<void>;
  list(query: SixOrbitSyncLogQuery): Promise<Paginated<SixOrbitSyncLogItem>>;
  /** The state of the integration over the last `windowHours`. */
  health(windowHours: number): Promise<SixOrbitSyncHealth>;
  /**
   * Deletes attempts older than `olderThanDays` and returns how many went.
   *
   * The log grows by one row per attempt and a catalogue pull is thousands of them, so
   * something has to remove the history eventually. Deliberately manual for now rather
   * than automatic: nobody should discover that last month's evidence was swept away by a
   * default they never chose.
   */
  prune(olderThanDays: number): Promise<number>;
}
