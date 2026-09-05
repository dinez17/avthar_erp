import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, runningBalance, transferProblem } from '@tiles-erp/shared';
import type {
  CashBook,
  CashEntryInput,
  CashEntryItem,
  CashPosition,
  CashPositionRow,
  CashTransferInput,
  ISODateString,
  OwnerSourceRow,
  OwnerStatement,
  OwnerSummary,
  OwnerSummaryRow,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  CashBookQuery,
  CashEntryRepository,
  CashPositionQuery,
} from '../domain/cash-entry.repository';
import { CashPostingService } from './cash-posting.service';

const round2 = (value: number): number => Math.round(value * 100) / 100;

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const include = {
  account: { select: { name: true } },
  counterAccount: { select: { name: true } },
  expenseHead: { select: { name: true } },
  branch: { select: { name: true } },
} satisfies Prisma.CashEntryInclude;

type Row = Prisma.CashEntryGetPayload<{ include: typeof include }>;

/**
 * The order the book is read in: by date, then by the order rows were written.
 *
 * Two entries on the same day need a tiebreaker or the running balance beside them
 * changes between two reads of the same page, which makes the column useless.
 */
const BOOK_ORDER: Prisma.CashEntryOrderByWithRelationInput[] = [
  { entryDate: 'asc' },
  { createdAt: 'asc' },
];

@Injectable()
export class PrismaCashEntryRepository implements CashEntryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: CashPostingService,
  ) {}

  private toItem(row: Row, balance: number): CashEntryItem {
    return {
      id: row.id,
      entryNumber: row.entryNumber,
      accountId: row.accountId,
      accountName: row.account.name,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
      entryDate: row.entryDate.toISOString(),
      type: row.type,
      direction: row.direction,
      amount: Number(row.amount),
      expenseHeadId: row.expenseHeadId,
      expenseHeadName: row.expenseHead?.name ?? null,
      counterAccountId: row.counterAccountId,
      counterAccountName: row.counterAccount?.name ?? null,
      source: row.source,
      refType: row.refType,
      refNumber: row.refNumber,
      referenceNo: row.referenceNo,
      narration: row.narration,
      reversedAt: row.reversedAt?.toISOString() ?? null,
      reversalReason: row.reversalReason,
      balance,
    };
  }

  /**
   * What an account held the moment before a date: its opening plus everything earlier.
   *
   * `hidden` is the cancelled rows to leave out. Both halves of a reversal must be in it
   * or neither — dropping only the original would take the money off twice.
   */
  private async openingOn(
    accountId: UUID,
    from: Date,
    hidden: string[] = [],
  ): Promise<number> {
    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { openingBalance: true },
    });
    if (!account) throw new NotFoundError('Account not found');

    const sums = await this.prisma.cashEntry.groupBy({
      by: ['direction'],
      where: {
        accountId,
        entryDate: { lt: from },
        ...(hidden.length > 0 ? { id: { notIn: hidden } } : {}),
      },
      _sum: { amount: true },
    });

    return sums.reduce(
      (balance, row) =>
        round2(balance + Number(row._sum.amount ?? 0) * (row.direction === 'IN' ? 1 : -1)),
      round2(Number(account.openingBalance)),
    );
  }

  async book(query: CashBookQuery): Promise<CashBook> {
    const from = startOfDay(new Date(query.from));
    const to = endOfDay(new Date(query.to));
    if (from > to) throw new ValidationError('The period ends before it starts');

    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: query.accountId, deletedAt: null },
      select: { id: true, name: true, type: true },
    });
    if (!account) throw new NotFoundError('Account not found');

    // A reversed entry and its contra cancel each other, so by default neither is shown.
    // Leaving them in doubles the totals in a way that reads as fact: an owner who took
    // 3,000 appears to have taken 10,000 and paid 7,000 back, which is bookkeeping
    // mechanics presented as what happened. The pair is still there to be asked for.
    const hidden = query.includeReversed ? [] : await this.voidedIds(account.id);

    const openingBalance = await this.openingOn(account.id, from, hidden);
    const rows = await this.prisma.cashEntry.findMany({
      where: {
        accountId: account.id,
        entryDate: { gte: from, lte: to },
        ...(hidden.length > 0 ? { id: { notIn: hidden } } : {}),
      },
      include,
      orderBy: BOOK_ORDER,
    });

    // Every row shown moves the balance. When reversals are shown, the original and its
    // contra both count and cancel where they sit — zeroing the original would leave the
    // contra moving the balance on its own.
    const movements = rows.map((row) => ({
      direction: row.direction,
      amount: Number(row.amount),
    }));
    const { rows: walked, closing } = runningBalance(openingBalance, movements);

    const sum = (direction: 'IN' | 'OUT'): number =>
      round2(
        rows
          .filter((row) => row.direction === direction)
          .reduce((total, row) => total + Number(row.amount), 0),
      );

    return {
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      from: from.toISOString(),
      to: to.toISOString(),
      openingBalance,
      received: sum('IN'),
      paid: sum('OUT'),
      closingBalance: closing,
      reversedHidden: hidden.length === 0 ? 0 : await this.countHiddenIn(account.id, from, to, hidden),
      entries: rows.map((row, index) => this.toItem(row, walked[index]!.balance)),
    };
  }

  /**
   * Every row on an account that a reversal cancelled: the original and its contra.
   *
   * Found through `reversalEntryId`, the link written when the contra was created, rather
   * than by matching amounts — two entries of the same size on the same day are ordinary,
   * and guessing which cancelled which would eventually guess wrong.
   */
  private async voidedIds(accountId: UUID): Promise<string[]> {
    const reversed = await this.prisma.cashEntry.findMany({
      where: { accountId, reversalEntryId: { not: null } },
      select: { id: true, reversalEntryId: true },
    });
    return reversed.flatMap((row) => [row.id, row.reversalEntryId as string]);
  }

  /** How many cancelled rows fall inside the window, so the page can offer to show them. */
  private async countHiddenIn(
    accountId: UUID,
    from: Date,
    to: Date,
    hidden: string[],
  ): Promise<number> {
    return this.prisma.cashEntry.count({
      where: { accountId, entryDate: { gte: from, lte: to }, id: { in: hidden } },
    });
  }

  async position(query: CashPositionQuery): Promise<CashPosition> {
    const on = new Date(query.on);
    const from = startOfDay(on);
    const to = endOfDay(on);

    const accounts = await this.prisma.ledgerAccount.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        openingBalance: true,
        branch: { select: { name: true } },
      },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
    const ids = accounts.map((account) => account.id);

    // Two sweeps rather than one per account: everything before the day, and the day
    // itself. A branch with thirty accounts would otherwise be sixty round trips.
    const [before, during] = await Promise.all([
      this.prisma.cashEntry.groupBy({
        by: ['accountId', 'direction'],
        where: { accountId: { in: ids }, entryDate: { lt: from } },
        _sum: { amount: true },
      }),
      this.prisma.cashEntry.groupBy({
        by: ['accountId', 'direction'],
        where: { accountId: { in: ids }, entryDate: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
    ]);

    const pick = (
      groups: typeof before,
      accountId: string,
      direction: 'IN' | 'OUT',
    ): number =>
      round2(
        Number(
          groups.find((row) => row.accountId === accountId && row.direction === direction)?._sum
            .amount ?? 0,
        ),
      );

    const rows: CashPositionRow[] = accounts.map((account) => {
      const opening = round2(
        Number(account.openingBalance) + pick(before, account.id, 'IN') - pick(before, account.id, 'OUT'),
      );
      const received = pick(during, account.id, 'IN');
      const paid = pick(during, account.id, 'OUT');
      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        branchName: account.branch?.name ?? null,
        openingBalance: opening,
        received,
        paid,
        closingBalance: round2(opening + received - paid),
      };
    });

    // Owner money is totalled apart from cash on purpose. It is still the company's, but
    // it is not in a till — rolling it into "cash" would answer "how much can the counter
    // pay out today" with a figure that includes notes sitting in somebody's house.
    const totalOf = (type: 'CASH' | 'BANK' | 'OWNER'): number =>
      round2(
        rows.filter((row) => row.accountType === type).reduce((sum, row) => sum + row.closingBalance, 0),
      );
    const totalCash = totalOf('CASH');
    const totalBank = totalOf('BANK');
    const totalWithOwners = totalOf('OWNER');

    return {
      on: from.toISOString(),
      rows,
      totalCash,
      totalBank,
      totalWithOwners,
      total: round2(totalCash + totalBank + totalWithOwners),
    };
  }

  async post(input: CashEntryInput, actorId: UUID): Promise<CashEntryItem> {
    if (input.type === 'EXPENSE' && !input.expenseHeadId) {
      throw new ValidationError('Choose what the expense is for');
    }
    if (input.type !== 'EXPENSE' && input.expenseHeadId) {
      throw new ValidationError('Only an expense is booked under a head');
    }

    const created = await this.prisma.$transaction((tx) =>
      this.posting.post(
        tx,
        {
          accountId: input.accountId,
          entryDate: input.entryDate ? new Date(input.entryDate) : undefined,
          type: input.type,
          // A receipt is money arriving; a payment and an expense are money leaving.
          direction: input.type === 'RECEIPT' ? 'IN' : 'OUT',
          amount: input.amount,
          expenseHeadId: input.expenseHeadId ?? null,
          referenceNo: input.referenceNo,
          narration: input.narration,
        },
        actorId,
      ),
    );

    return this.byId(created.id);
  }

  async transfer(input: CashTransferInput, actorId: UUID): Promise<CashEntryItem[]> {
    const problem = transferProblem(input.fromAccountId, input.toAccountId, input.amount);
    if (problem) throw new ValidationError(problem);

    const at = input.entryDate ? new Date(input.entryDate) : new Date();

    // Both legs in one transaction, then linked. Half a transfer is money that has left
    // one account without arriving in the other, which no later screen could explain.
    const ids = await this.prisma.$transaction(async (tx) => {
      const out = await this.posting.post(
        tx,
        {
          accountId: input.fromAccountId,
          entryDate: at,
          type: 'TRANSFER',
          direction: 'OUT',
          amount: input.amount,
          counterAccountId: input.toAccountId,
          referenceNo: input.referenceNo,
          narration: input.narration,
        },
        actorId,
      );
      const into = await this.posting.post(
        tx,
        {
          accountId: input.toAccountId,
          entryDate: at,
          type: 'TRANSFER',
          direction: 'IN',
          amount: input.amount,
          counterAccountId: input.fromAccountId,
          referenceNo: input.referenceNo,
          narration: input.narration,
        },
        actorId,
      );

      await tx.cashEntry.update({ where: { id: out.id }, data: { pairedEntryId: into.id } });
      await tx.cashEntry.update({ where: { id: into.id }, data: { pairedEntryId: out.id } });
      return [out.id, into.id];
    });

    return Promise.all(ids.map((id) => this.byId(id)));
  }

  async reverse(id: UUID, reason: string, actorId: UUID): Promise<CashEntryItem> {
    const contra = await this.prisma.$transaction((tx) =>
      this.posting.reverse(tx, id, reason, actorId),
    );
    return this.byId(contra.id);
  }

  async owners(from: ISODateString, to: ISODateString): Promise<OwnerSummary> {
    const start = startOfDay(new Date(from));
    const end = endOfDay(new Date(to));

    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { deletedAt: null, type: 'OWNER' },
      select: { id: true, name: true, openingBalance: true },
      orderBy: { name: 'asc' },
    });
    const ids = accounts.map((account) => account.id);

    // Cancelled rows are left out here too. "Taken" on this page is what an owner actually
    // took — a figure someone might be asked to sign for — not the gross of every row
    // written and then withdrawn.
    const reversed = await this.prisma.cashEntry.findMany({
      where: { accountId: { in: ids }, reversalEntryId: { not: null } },
      select: { id: true, reversalEntryId: true },
    });
    const hidden = reversed.flatMap((row) => [row.id, row.reversalEntryId as string]);
    const notCancelled = hidden.length > 0 ? { id: { notIn: hidden } } : {};

    const [before, during] = await Promise.all([
      this.prisma.cashEntry.groupBy({
        by: ['accountId', 'direction'],
        where: { accountId: { in: ids }, entryDate: { lt: start }, ...notCancelled },
        _sum: { amount: true },
      }),
      this.prisma.cashEntry.groupBy({
        by: ['accountId', 'direction'],
        where: {
          accountId: { in: ids },
          entryDate: { gte: start, lte: end },
          ...notCancelled,
        },
        _sum: { amount: true },
      }),
    ]);

    const pick = (groups: typeof before, accountId: string, direction: 'IN' | 'OUT'): number =>
      round2(
        Number(
          groups.find((row) => row.accountId === accountId && row.direction === direction)?._sum
            .amount ?? 0,
        ),
      );

    const rows: OwnerSummaryRow[] = accounts.map((account) => {
      const openingBalance = round2(
        Number(account.openingBalance) +
          pick(before, account.id, 'IN') -
          pick(before, account.id, 'OUT'),
      );
      const taken = pick(during, account.id, 'IN');
      const paidOut = pick(during, account.id, 'OUT');
      return {
        accountId: account.id,
        accountName: account.name,
        openingBalance,
        taken,
        paidOut,
        closingBalance: round2(openingBalance + taken - paidOut),
      };
    });

    return {
      from: start.toISOString(),
      to: end.toISOString(),
      rows,
      totalHeld: round2(rows.reduce((sum, row) => sum + row.closingBalance, 0)),
    };
  }

  /**
   * One owner's statement: what they took, where from, and what has left again.
   *
   * Built from the same rows as their cash book rather than a separate tally — an owner
   * asked to sign for a figure should be able to follow it down the page.
   */
  async ownerStatement(
    accountId: UUID,
    from: ISODateString,
    to: ISODateString,
    includeReversed = false,
  ): Promise<OwnerStatement> {
    const book = await this.book({ accountId, from, to, includeReversed });

    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { type: true },
    });
    if (account?.type !== 'OWNER') {
      throw new ValidationError('That account is not an owner');
    }

    // Where each rupee came from, over whatever the book decided to show. With reversals
    // hidden this is what the owner actually took from each drawer.
    const sources = new Map<string, OwnerSourceRow>();
    for (const entry of book.entries) {
      if (entry.direction !== 'IN' || !entry.counterAccountId) continue;
      const existing = sources.get(entry.counterAccountId) ?? {
        accountId: entry.counterAccountId,
        accountName: entry.counterAccountName ?? 'Unknown',
        branchName: null,
        amount: 0,
        handovers: 0,
      };
      existing.amount = round2(existing.amount + entry.amount);
      existing.handovers += 1;
      sources.set(entry.counterAccountId, existing);
    }

    // Branch names for the drawers, so the statement says "AM Build Mart counter" rather
    // than leaving the owner to work out which till that was.
    const sourceRows = [...sources.values()];
    if (sourceRows.length > 0) {
      const drawers = await this.prisma.ledgerAccount.findMany({
        where: { id: { in: sourceRows.map((row) => row.accountId) } },
        select: { id: true, branch: { select: { name: true } } },
      });
      const byId = new Map(drawers.map((drawer) => [drawer.id, drawer.branch?.name ?? null]));
      for (const row of sourceRows) row.branchName = byId.get(row.accountId) ?? null;
    }

    // What left, split between money that reached a bank and everything else. The split is
    // the point: cash that went to a bank is accounted for, cash that went anywhere else
    // is the part somebody will be asked about.
    const bankIds = new Set(
      (
        await this.prisma.ledgerAccount.findMany({
          where: { type: 'BANK', deletedAt: null },
          select: { id: true },
        })
      ).map((row) => row.id),
    );

    let banked = 0;
    let otherOut = 0;
    for (const entry of book.entries) {
      if (entry.direction !== 'OUT') continue;
      if (entry.counterAccountId && bankIds.has(entry.counterAccountId)) {
        banked = round2(banked + entry.amount);
      } else {
        otherOut = round2(otherOut + entry.amount);
      }
    }

    return {
      accountId: book.accountId,
      accountName: book.accountName,
      from: book.from,
      to: book.to,
      openingBalance: book.openingBalance,
      takenFrom: sourceRows.sort((a, b) => b.amount - a.amount),
      taken: book.received,
      banked,
      otherOut,
      closingBalance: book.closingBalance,
      reversedHidden: book.reversedHidden,
      entries: book.entries,
    };
  }

  /** One entry, with the balance left blank — a single row is not part of a running page. */
  private async byId(id: string): Promise<CashEntryItem> {
    const row = await this.prisma.cashEntry.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundError('Entry not found');
    return this.toItem(row, 0);
  }
}
