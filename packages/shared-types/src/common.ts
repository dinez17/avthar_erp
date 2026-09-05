/** Universally unique identifier (UUID v4) represented as a string. */
export type UUID = string;

/** ISO-8601 date-time string. */
export type ISODateString = string;

/** Sort direction used by grids and query builders. */
export type SortOrder = 'asc' | 'desc';

/** Nullable helper. */
export type Nullable<T> = T | null;

/** Makes the specified keys optional. */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Audit fields present on every persisted entity (soft-delete + optimistic concurrency). */
export interface AuditFields {
  createdAt: ISODateString;
  createdBy: UUID | null;
  updatedAt: ISODateString;
  updatedBy: UUID | null;
  deletedAt: ISODateString | null;
  deletedBy: UUID | null;
  /** Optimistic concurrency token. */
  version: number;
}

/** Base shape shared by all domain entities. */
export interface BaseEntity extends AuditFields {
  id: UUID;
}

/**
 * The ageing buckets used wherever something is measured in days waiting.
 *
 * Receivables age from a due date and undelivered goods age from the invoice date, but
 * the columns are the same five. `ageingBucketFor` in `@tiles-erp/shared` decides which
 * one a given number of days falls in.
 */
export type AgeingBucket = 'current' | 'days30' | 'days60' | 'days90' | 'older';
