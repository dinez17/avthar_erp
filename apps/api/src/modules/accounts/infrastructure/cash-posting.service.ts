import { Injectable } from '@nestjs/common';
import { isDayLocked, NotFoundError, ValidationError, wouldOverdraw } from '@tiles-erp/shared';
import type {
  CashEntryDirection,
  CashEntrySource,
  CashEntryType,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService, type Db } from '../../../core/numbering/document-number.service';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Everything a row in the book needs, whether typed or produced by another document. */
export interface PostCashEntry {
  accountId: UUID;
  entryDate?: Date;
  type: CashEntryType;
  direction: CashEntryDirection;
  amount: number;
  expenseHeadId?: UUID | null;
  counterAccountId?: UUID | null;
  source?: CashEntrySource;
  /** What produced it, when it was not typed: 'CustomerReceipt', 'SupplierPayment'. */
  refType?: string | null;
  refId?: UUID | null;
  refNumber?: string | null;
  referenceNo?: string | null;
  narration?: string | null;
  /**
   * Lets this entry land in a day that has already been closed.
   *
   * Only the day-close itself sets this, for the adjusting entry that brings the book to
   * what was counted — that entry belongs to the closed day by definition, and would
   * otherwise be refused by the lock it is part of creating.
   */
  allowClosedDay?: boolean;
}

/**
 * The one place a row is added to the cash book.
 *
 * Receipts, supplier payments, driver handovers and anything typed by hand all come
 * through here, so the rules that make a balance trustworthy — a drawer cannot go
 * negative, an entry always has a number, an account must be open — are stated once
 * rather than repeated in every module that moves money.
 *
 * Every method takes a `Db`, so posting joins the caller's transaction: a receipt that
 * fails to save takes its cash entry down with it.
 */
@Injectable()
export class CashPostingService {
  constructor(private readonly numbering: DocumentNumberService) {}

  /**
   * What an account holds: its opening plus every entry, without exception.
   *
   * A reversed entry still counts. It has to: reversing writes a contra row, and if the
   * original were also dropped from the sum the money would come off the balance twice.
   * The pair cancels, which is the whole point of a contra — the balance is right and
   * both rows stay on the page. `reversedAt` marks a row as corrected; it never hides it.
   *
   * Counted rather than stored, for the same reason stock balances are a projection of
   * movements — a stored figure and a ledger disagree eventually, and only one of them
   * can be audited.
   */
  async balanceOf(db: Db, accountId: UUID): Promise<number> {
    const account = await db.ledgerAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { openingBalance: true },
    });
    if (!account) throw new NotFoundError('Account not found');

    const sums = await db.cashEntry.groupBy({
      by: ['direction'],
      where: { accountId },
      _sum: { amount: true },
    });

    return sums.reduce(
      (balance, row) =>
        round2(balance + Number(row._sum.amount ?? 0) * (row.direction === 'IN' ? 1 : -1)),
      round2(Number(account.openingBalance)),
    );
  }

  /**
   * The last day closed for an account, or null if it has never been counted.
   *
   * Reopened closes do not count — reopening is what makes a day writable again.
   */
  async lastCloseDate(db: Db, accountId: UUID): Promise<Date | null> {
    const latest = await db.cashCount.findFirst({
      where: { accountId, reopenedAt: null },
      orderBy: { closeDate: 'desc' },
      select: { closeDate: true },
    });
    return latest?.closeDate ?? null;
  }

  /**
   * Writes one row.
   *
   * A cash drawer is checked against its balance first: a drawer holding 5,000 cannot pay
   * out 6,000 whatever the books say, because the notes are not there. A bank account is
   * not checked — going below zero is what an overdraft is, and refusing it would block
   * legitimate payments.
   */
  async post(db: Db, entry: PostCashEntry, createdBy: UUID): Promise<{ id: string }> {
    const amount = round2(entry.amount);
    if (amount <= 0) throw new ValidationError('Enter an amount greater than zero');

    const account = await db.ledgerAccount.findFirst({
      where: { id: entry.accountId, deletedAt: null },
      select: { id: true, name: true, type: true, branchId: true, isActive: true },
    });
    if (!account) throw new NotFoundError('Account not found');
    if (!account.isActive) {
      throw new ValidationError(`${account.name} is inactive — nothing can be posted to it`);
    }

    if (entry.direction === 'OUT' && account.type === 'CASH') {
      const balance = await this.balanceOf(db, account.id);
      if (wouldOverdraw(balance, amount)) {
        throw new ValidationError(
          `${account.name} holds ${balance.toFixed(2)}, so ${amount.toFixed(2)} cannot be paid out of it. A cash drawer cannot go negative.`,
        );
      }
    }

    if (entry.expenseHeadId) {
      const head = await db.expenseHead.findFirst({
        where: { id: entry.expenseHeadId, deletedAt: null },
        select: { id: true },
      });
      if (!head) throw new ValidationError('That expense head no longer exists');
    }

    const at = entry.entryDate ?? new Date();

    // Nothing lands behind a count. Closing a day says "this is what was there"; an entry
    // slipped in afterwards makes that statement false without changing the paper it was
    // written on, which is the one thing a close exists to prevent.
    if (!entry.allowClosedDay) {
      const lastClose = await this.lastCloseDate(db, account.id);
      if (isDayLocked(at, lastClose)) {
        throw new ValidationError(
          `${account.name} is closed up to ${lastClose!.toLocaleDateString('en-IN')}. Date this entry after that, or reopen the day.`,
        );
      }
    }
    const documentType = entry.type === 'EXPENSE' ? 'EXPENSE' : 'CASH_ENTRY';
    const entryNumber = await this.numbering.next(db, documentType, account.branchId, at);

    return db.cashEntry.create({
      data: {
        entryNumber,
        accountId: account.id,
        branchId: account.branchId,
        entryDate: at,
        type: entry.type,
        direction: entry.direction,
        amount,
        expenseHeadId: entry.expenseHeadId ?? null,
        counterAccountId: entry.counterAccountId ?? null,
        source: entry.source ?? 'MANUAL',
        refType: entry.refType ?? null,
        refId: entry.refId ?? null,
        refNumber: entry.refNumber ?? null,
        referenceNo: entry.referenceNo?.trim() || null,
        narration: entry.narration?.trim() || null,
        createdBy,
      },
      select: { id: true },
    });
  }

  /**
   * Reverses an entry by writing its mirror image, and links the two.
   *
   * The original row is never edited or deleted. A book that can be rewritten is not a
   * book — the correction has to be as visible as the mistake, or a balance that changed
   * overnight has no explanation on the page.
   */
  async reverse(db: Db, id: UUID, reason: string, actorId: UUID): Promise<{ id: string }> {
    const original = await db.cashEntry.findUnique({
      where: { id },
      select: {
        id: true,
        entryNumber: true,
        accountId: true,
        branchId: true,
        type: true,
        direction: true,
        amount: true,
        expenseHeadId: true,
        counterAccountId: true,
        pairedEntryId: true,
        reversedAt: true,
      },
    });
    if (!original) throw new NotFoundError('Entry not found');
    if (original.reversedAt) throw new ValidationError('That entry has already been reversed');
    if (!reason.trim()) throw new ValidationError('Say why it is being reversed');

    const contra = await this.writeContra(db, original, reason, actorId);

    // A transfer is two rows. Reversing one without the other would leave money that
    // exists in one account and not the other, so the pair moves together.
    if (original.pairedEntryId) {
      const paired = await db.cashEntry.findUnique({
        where: { id: original.pairedEntryId },
        select: {
          id: true,
          accountId: true,
          branchId: true,
          type: true,
          direction: true,
          amount: true,
          expenseHeadId: true,
          counterAccountId: true,
          entryNumber: true,
          reversedAt: true,
        },
      });
      if (paired && !paired.reversedAt) {
        await this.writeContra(db, paired, reason, actorId);
      }
    }

    return contra;
  }

  private async writeContra(
    db: Db,
    original: {
      id: string;
      entryNumber: string;
      accountId: string;
      branchId: string | null;
      type: CashEntryType;
      direction: CashEntryDirection;
      amount: unknown;
      expenseHeadId: string | null;
      counterAccountId: string | null;
    },
    reason: string,
    actorId: UUID,
  ): Promise<{ id: string }> {
    const at = new Date();
    const documentType = original.type === 'EXPENSE' ? 'EXPENSE' : 'CASH_ENTRY';
    const entryNumber = await this.numbering.next(db, documentType, original.branchId, at);

    const contra = await db.cashEntry.create({
      data: {
        entryNumber,
        accountId: original.accountId,
        branchId: original.branchId,
        entryDate: at,
        type: original.type,
        direction: original.direction === 'IN' ? 'OUT' : 'IN',
        amount: Number(original.amount),
        expenseHeadId: original.expenseHeadId,
        counterAccountId: original.counterAccountId,
        source: 'MANUAL',
        refType: 'CashEntry',
        refId: original.id,
        refNumber: original.entryNumber,
        narration: `Reversal of ${original.entryNumber} — ${reason.trim()}`,
        createdBy: actorId,
      },
      select: { id: true },
    });

    await db.cashEntry.update({
      where: { id: original.id },
      data: {
        reversedAt: at,
        reversedBy: actorId,
        reversalReason: reason.trim(),
        reversalEntryId: contra.id,
      },
    });

    return contra;
  }

  /**
   * Undoes whatever a document put in the book, when that document is cancelled.
   *
   * Used by receipts and supplier payments: cancelling one has to take its money back out
   * of the account it went into, and the contra row is how that shows.
   */
  async reverseFor(
    db: Db,
    refType: string,
    refId: UUID,
    reason: string,
    actorId: UUID,
  ): Promise<void> {
    const entries = await db.cashEntry.findMany({
      where: { refType, refId, reversedAt: null },
      select: { id: true },
    });

    for (const entry of entries) {
      // Re-read rather than trusting the list. A document can own both legs of a transfer
      // — a day close hands cash to an owner — and reversing one leg already takes its
      // pair with it, so by the time the loop reaches the second it is done.
      const current = await db.cashEntry.findUnique({
        where: { id: entry.id },
        select: { reversedAt: true },
      });
      if (current?.reversedAt) continue;
      await this.reverse(db, entry.id, reason, actorId);
    }
  }
}
