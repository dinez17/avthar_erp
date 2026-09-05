import type {
  CashCountItem,
  CloseDayInput,
  DayCloseStatus,
  ISODateString,
  UUID,
  VarianceReport,
} from '@tiles-erp/shared-types';

export const CASH_COUNT_REPOSITORY = Symbol('CASH_COUNT_REPOSITORY');

export interface CashCountFilter {
  accountId?: UUID;
  branchId?: UUID;
  from?: ISODateString;
  to?: ISODateString;
}

/**
 * Port for counting an account against its book.
 *
 * A cash book nobody counts is a guess. Closing a day freezes what the book said, records
 * what was actually there, and locks the day so nothing lands behind the count.
 */
export interface CashCountRepository {
  /** What the screen needs before anyone counts: the next open day and what is expected. */
  status(accountId: UUID): Promise<DayCloseStatus>;

  list(filter: CashCountFilter): Promise<CashCountItem[]>;

  /** Closes a day. Optionally writes an adjusting entry so the book matches the count. */
  close(input: CloseDayInput, actorId: UUID): Promise<CashCountItem>;

  /**
   * Unlocks a closed day. The close is marked reopened rather than deleted, and any
   * adjusting entry it wrote is reversed with a contra row.
   */
  reopen(id: UUID, reason: string, actorId: UUID): Promise<CashCountItem>;

  /** The last day closed for an account, used to refuse entries behind it. */
  lastCloseDate(accountId: UUID): Promise<Date | null>;

  /**
   * How the counts have gone over a period, one line per account.
   *
   * A single short day is a mistake; the same till short every week is something else,
   * and only a report over time can tell them apart.
   */
  variances(from: ISODateString, to: ISODateString, branchId?: UUID): Promise<VarianceReport>;
}
