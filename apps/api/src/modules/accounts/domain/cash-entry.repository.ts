import type {
  CashBook,
  CashEntryInput,
  CashEntryItem,
  CashPosition,
  CashTransferInput,
  ISODateString,
  OwnerStatement,
  OwnerSummary,
  UUID,
} from '@tiles-erp/shared-types';

export const CASH_ENTRY_REPOSITORY = Symbol('CASH_ENTRY_REPOSITORY');

export interface CashBookQuery {
  accountId: UUID;
  /**
   * Show reversed entries and their contra rows.
   *
   * Off by default. The pair cancels, so leaving both in doubles every total — an owner
   * who took 3,000 reads as having taken 10,000 and paid 7,000 back.
   */
  includeReversed?: boolean;
  from: ISODateString;
  to: ISODateString;
}

export interface CashPositionQuery {
  on: ISODateString;
  branchId?: UUID;
}

/**
 * Port for the book itself: what has moved, and what each account is left holding.
 *
 * Entries are only ever added. Nothing here edits or deletes a row — a mistake is
 * corrected by a contra entry, so the correction is as visible as the mistake was.
 */
export interface CashEntryRepository {
  /** One account over a period: opening, the rows in order, and closing. */
  book(query: CashBookQuery): Promise<CashBook>;

  /** Every account on one day — the "where is the money" answer. */
  position(query: CashPositionQuery): Promise<CashPosition>;

  /** A receipt, a payment or an expense typed by hand. */
  post(input: CashEntryInput, actorId: UUID): Promise<CashEntryItem>;

  /** Money between two of your own accounts: one row out, one row in, written together. */
  transfer(input: CashTransferInput, actorId: UUID): Promise<CashEntryItem[]>;

  /** Writes the mirror image of an entry and links the two. */
  reverse(id: UUID, reason: string, actorId: UUID): Promise<CashEntryItem>;

  /** Every owner on one line: who is holding how much. */
  owners(from: ISODateString, to: ISODateString): Promise<OwnerSummary>;

  /** One owner's holding: where it came from, where it went, what is left. */
  ownerStatement(
    accountId: UUID,
    from: ISODateString,
    to: ISODateString,
    includeReversed?: boolean,
  ): Promise<OwnerStatement>;
}
