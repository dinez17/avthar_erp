import type { ISODateString, UUID } from './common';

/** Which of our records a sync attempt was about. */
export type SixOrbitEntityType = 'CONNECTION' | 'MASTER' | 'CUSTOMER' | 'PRODUCT' | 'SALES_ORDER';

/** Which way the data moved. */
export type SixOrbitDirection = 'PUSH' | 'PULL';

/**
 * Connection details as the settings screen sees them.
 *
 * There is deliberately no password field. The stored password can be replaced but never
 * read back, so it cannot leak through an API response, a browser cache or a screenshot.
 * `hasPassword` is all the UI needs in order to say whether one has been set.
 */
export interface SixOrbitConfigItem {
  id: UUID;
  baseUrl: string;
  apiKey: string;
  email: string;
  hasPassword: boolean;
  requestTimeoutMs: number;
  isActive: boolean;
  notes: string | null;
  /** When a session was last obtained. Null when we have never logged in. */
  tokenFetchedAt: ISODateString | null;
  updatedAt: ISODateString;
  version: number;
}

export interface SaveSixOrbitConfigInput {
  baseUrl: string;
  apiKey?: string;
  email: string;
  /** Omit to leave the stored password untouched. */
  password?: string;
  requestTimeoutMs?: number;
  isActive?: boolean;
  notes?: string | null;
  version?: number;
}

/** What "Test connection" reports back. */
export interface SixOrbitConnectionTest {
  success: boolean;
  /** Plain language, safe to show a user — never contains a credential. */
  message: string;
  /** Populated on success, straight from their login response. */
  userName?: string;
  companyCode?: string;
  companyName?: string;
  /** Their outlet, which has no counterpart in our branch hierarchy. */
  outletName?: string;
  durationMs: number;
}

/** One attempt against their API. */
export interface SixOrbitSyncLogItem {
  id: UUID;
  entityType: SixOrbitEntityType;
  entityId: UUID | null;
  externalId: string | null;
  task: string;
  direction: SixOrbitDirection;
  attempt: number;
  success: boolean;
  resultCode: string | null;
  message: string | null;
  requestSummary: string | null;
  /** The JSON posted in their `data` field, truncated. Null for a GET. */
  requestBody: string | null;
  responseBody: string | null;
  durationMs: number;
  jobId: string | null;
  createdAt: ISODateString;
}

export interface SixOrbitSyncLogQuery {
  entityType?: SixOrbitEntityType;
  entityId?: UUID;
  success?: boolean;
  task?: string;
  /** Free text across the task, the message and their id. */
  search?: string;
  from?: ISODateString;
  to?: ISODateString;
  page?: number;
  pageSize?: number;
}

/** How one kind of record has been faring. */
export interface SixOrbitEntityHealth {
  entityType: SixOrbitEntityType;
  /**
   * All-time, not windowed. "When did this last work at all?" is the question worth
   * answering; a window that happens to contain no successes would otherwise read the
   * same as one that has never worked.
   */
  lastSuccessAt: ISODateString | null;
  lastFailureAt: ISODateString | null;
  /** Attempts inside the window. */
  successes: number;
  failures: number;
}

/**
 * The state of the integration at a glance.
 *
 * Counts are windowed; the "last" timestamps are not. See {@link SixOrbitEntityHealth}.
 */
export interface SixOrbitSyncHealth {
  windowHours: number;
  totalAttempts: number;
  totalFailures: number;
  /**
   * Records whose most recent attempt failed — the dead letter.
   *
   * Counted per record rather than per attempt, so one customer that failed six times is
   * one problem rather than six, and a record that failed then succeeded is neither.
   */
  failingRecords: number;
  averageDurationMs: number;
  slowestDurationMs: number;
  byEntity: SixOrbitEntityHealth[];
  generatedAt: ISODateString;
}

export interface SixOrbitPruneResult {
  deleted: number;
  olderThanDays: number;
}

export type SixOrbitJobKind =
  /** Pull SixOrbit's catalogue: masters out of the variations, then the products. */
  | 'PRODUCT_IMPORT'
  /** Write one of our products into their catalogue. */
  | 'PRODUCT_PUSH';

/**
 * The payload of a PRODUCT_IMPORT job.
 *
 * Every job kind is deliberately thin — ids, not a snapshot of the record. The processor
 * re-reads from the database when it runs, so a job that waited in the queue through three
 * edits sends what the record says now rather than what it said when it was queued.
 */
export interface SixOrbitImportJobData {
  kind: 'PRODUCT_IMPORT';
  /** ISO timestamp, or null for the whole catalogue. */
  since: string | null;
  actorId: string | null;
}

/** One product on its way to SixOrbit (12.4). */
export interface SixOrbitProductPushJobData {
  kind: 'PRODUCT_PUSH';
  productId: string;
  actorId: string | null;
}

/**
 * Everything the `sixorbit` queue carries.
 *
 * A union rather than a bag of optional fields, so a processor that forgets to narrow
 * fails to compile rather than at three in the morning.
 */
export type SixOrbitJobData = SixOrbitImportJobData | SixOrbitProductPushJobData;

/** What a push did, as the console and the page report it. */
export interface SixOrbitPushResult {
  productId: string;
  operation: 'create' | 'edit' | 'blocked';
  sixorbitId: string | null;
  /** True when a create found it already there and edited it instead of duplicating. */
  adopted: boolean;
  reason: string | null;
}

// ---------------------------------------------------------------------
// Product import (12.2)
// ---------------------------------------------------------------------

/** Something about an imported row that a human should look at. */
export type SixOrbitMappingWarning =
  /** No pieces-per-box or no area — the product cannot be sold by the square foot. */
  | 'MISSING_GEOMETRY'
  /** The stated area disagrees with the tile's own SIZE attribute by more than a hair. */
  | 'AREA_DISAGREES_WITH_SIZE'
  /** No selling price at all. */
  | 'MISSING_PRICE'
  /** Landing cost at or above the selling price — the below-cost guard would misfire. */
  | 'COST_NOT_BELOW_PRICE'
  /** Landing cost so far under the price that it looks unmaintained rather than cheap. */
  | 'COST_IMPLAUSIBLY_LOW';

/** A row that could not be imported, and why — never a silent drop. */
export interface SixOrbitImportSkip {
  sixorbitId: string;
  name: string;
  reason: string;
}

export interface SixOrbitImportResult {
  dryRun: boolean;
  /** Rows they sent. */
  fetched: number;
  /** Rows they say match the query, from the `limit` they repeat on every row. */
  total: number | null;
  productsCreated: number;
  productsUpdated: number;
  brandsCreated: number;
  categoriesCreated: number;
  /** Imported, but carrying at least one warning. */
  flagged: number;
  warningCounts: Partial<Record<SixOrbitMappingWarning, number>>;
  skipped: SixOrbitImportSkip[];
  durationMs: number;
}

export type SixOrbitImportState = 'IDLE' | 'RUNNING' | 'DONE' | 'FAILED';

/** What the import page polls while a run is in flight. */
/**
 * What the queue itself says, read straight from Redis by the API.
 *
 * The progress record alone cannot tell "no worker is running" from "the worker is busy",
 * and those need opposite responses. The queue knows: a job sitting in `waiting` with
 * nothing `active` means nobody is consuming it.
 */
export interface SixOrbitQueueSnapshot {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  /** Why the most recent failed job failed, if there is one. */
  lastFailureReason: string | null;
}

export interface SixOrbitImportStatus {
  state: SixOrbitImportState;
  startedAt: ISODateString | null;
  finishedAt: ISODateString | null;
  processed: number;
  totalToProcess: number;
  since: ISODateString | null;
  startedByName: string | null;
  result: SixOrbitImportResult | null;
  error: string | null;
}

/**
 * The progress record plus what the queue itself says.
 *
 * Kept separate from {@link SixOrbitImportStatus} because the two have different owners:
 * the worker writes the progress record, and only the API can read the queue.
 */
export interface SixOrbitImportStatusView extends SixOrbitImportStatus {
  /** Null when the queue could not be reached at all — that is itself the diagnosis. */
  queue: SixOrbitQueueSnapshot | null;
}

export interface StartSixOrbitImportInput {
  /** Work out what would change and write nothing. */
  dryRun?: boolean;
  /**
   * Pull only what they have touched since this moment. Omit for the whole catalogue —
   * which is what the first run has to be.
   */
  since?: ISODateString | null;
}
