import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  adjustmentFor,
  closeProblem,
  denominationTotal,
  handoverProblem,
  NotFoundError,
  ValidationError,
  varianceVerdict,
} from '@tiles-erp/shared';
import type {
  CashCountItem,
  CloseDayInput,
  DayCloseStatus,
  DenominationCounts,
  ISODateString,
  UUID,
  VarianceReport,
  VarianceRow,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { CashCountFilter, CashCountRepository } from '../domain/cash-count.repository';
import { CashPostingService } from './cash-posting.service';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Midnight local, because a close covers a day rather than an instant. */
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

const nextDay = (date: Date): Date => {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
};

const include = {
  account: { select: { name: true, type: true } },
  handoverAccount: { select: { name: true } },
  branch: { select: { name: true } },
} satisfies Prisma.CashCountInclude;

type Row = Prisma.CashCountGetPayload<{ include: typeof include }>;

@Injectable()
export class PrismaCashCountRepository implements CashCountRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
    private readonly posting: CashPostingService,
  ) {}

  private toItem(row: Row, closedByName: string | null): CashCountItem {
    return {
      id: row.id,
      countNo: row.countNo,
      accountId: row.accountId,
      accountName: row.account.name,
      accountType: row.account.type,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
      closeDate: row.closeDate.toISOString(),
      expectedBalance: Number(row.expectedBalance),
      countedAmount: Number(row.countedAmount),
      variance: Number(row.variance),
      handoverAmount: Number(row.handoverAmount),
      handoverAccountId: row.handoverAccountId,
      handoverAccountName: row.handoverAccount?.name ?? null,
      retainedAmount: Number(row.retainedAmount),
      denominations: (row.denominations as DenominationCounts | null) ?? null,
      adjustmentEntryId: row.adjustmentEntryId,
      notes: row.notes,
      reopenedAt: row.reopenedAt?.toISOString() ?? null,
      reopenReason: row.reopenReason,
      closedByName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Names for the `createdBy` ids, in one query rather than one per row. */
  private async closerNames(rows: Row[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.createdBy).filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      users.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]),
    );
  }

  async lastCloseDate(accountId: UUID): Promise<Date | null> {
    return this.posting.lastCloseDate(this.prisma, accountId);
  }

  /**
   * The balance an account should hold at the end of a day: its opening plus everything
   * dated on or before that day.
   */
  private async expectedAt(accountId: UUID, through: Date): Promise<number> {
    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { openingBalance: true },
    });
    if (!account) throw new NotFoundError('Account not found');

    const sums = await this.prisma.cashEntry.groupBy({
      by: ['direction'],
      where: { accountId, entryDate: { lte: endOfDay(through) } },
      _sum: { amount: true },
    });

    return sums.reduce(
      (balance, row) =>
        round2(balance + Number(row._sum.amount ?? 0) * (row.direction === 'IN' ? 1 : -1)),
      round2(Number(account.openingBalance)),
    );
  }

  async status(accountId: UUID): Promise<DayCloseStatus> {
    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { id: true, name: true, type: true, retainedFloat: true },
    });
    if (!account) throw new NotFoundError('Account not found');

    const lastClose = await this.lastCloseDate(accountId);
    // The first day still open. With nothing closed, that is today — there is no point
    // walking back to the account's opening date and offering to close a year of days.
    const candidate = lastClose ? nextDay(lastClose) : startOfDay(new Date());
    const nextCloseDate = candidate > startOfDay(new Date()) ? startOfDay(new Date()) : candidate;

    const [expectedBalance, movementCount] = await Promise.all([
      this.expectedAt(accountId, nextCloseDate),
      this.prisma.cashEntry.count({
        where: {
          accountId,
          entryDate: { gte: startOfDay(nextCloseDate), lte: endOfDay(nextCloseDate) },
        },
      }),
    ]);

    return {
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      lastCloseDate: lastClose?.toISOString() ?? null,
      nextCloseDate: nextCloseDate.toISOString(),
      expectedBalance,
      movementCount,
      retainedFloat: Number(account.retainedFloat),
    };
  }

  async list(filter: CashCountFilter): Promise<CashCountItem[]> {
    const rows = await this.prisma.cashCount.findMany({
      where: {
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.branchId ? { branchId: filter.branchId } : {}),
        ...(filter.from || filter.to
          ? {
              closeDate: {
                ...(filter.from ? { gte: startOfDay(new Date(filter.from)) } : {}),
                ...(filter.to ? { lte: endOfDay(new Date(filter.to)) } : {}),
              },
            }
          : {}),
      },
      include,
      orderBy: [{ closeDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const names = await this.closerNames(rows);
    return rows.map((row) => this.toItem(row, row.createdBy ? (names.get(row.createdBy) ?? null) : null));
  }

  async variances(
    from: ISODateString,
    to: ISODateString,
    branchId?: UUID,
  ): Promise<VarianceReport> {
    const start = startOfDay(new Date(from));
    const end = endOfDay(new Date(to));

    // Reopened closes are excluded. They were replaced by a fresh count, and carrying a
    // withdrawn figure into a trend would show a shortfall that was already corrected.
    const rows = await this.prisma.cashCount.findMany({
      where: {
        reopenedAt: null,
        closeDate: { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        accountId: true,
        closeDate: true,
        variance: true,
        account: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { closeDate: 'asc' },
    });

    const byAccount = new Map<string, VarianceRow>();
    for (const row of rows) {
      const variance = round2(Number(row.variance));
      const verdict = varianceVerdict(variance);

      const current = byAccount.get(row.accountId) ?? {
        accountId: row.accountId,
        accountName: row.account.name,
        branchName: row.branch?.name ?? null,
        daysCounted: 0,
        daysBalanced: 0,
        daysShort: 0,
        daysOver: 0,
        totalShort: 0,
        totalOver: 0,
        netVariance: 0,
        worstDate: null,
        worstVariance: 0,
      };

      current.daysCounted += 1;
      current.netVariance = round2(current.netVariance + variance);
      if (verdict === 'SHORT') {
        current.daysShort += 1;
        current.totalShort = round2(current.totalShort + Math.abs(variance));
      } else if (verdict === 'OVER') {
        current.daysOver += 1;
        current.totalOver = round2(current.totalOver + variance);
      } else {
        current.daysBalanced += 1;
      }

      // Worst by size in either direction: a drawer 5,000 over is as worth asking about
      // as one 5,000 short, and usually the same conversation.
      if (Math.abs(variance) > Math.abs(current.worstVariance)) {
        current.worstVariance = variance;
        current.worstDate = row.closeDate.toISOString();
      }

      byAccount.set(row.accountId, current);
    }

    const result = [...byAccount.values()].sort(
      (a, b) => Math.abs(b.netVariance) - Math.abs(a.netVariance),
    );

    return {
      from: start.toISOString(),
      to: end.toISOString(),
      rows: result,
      netVariance: round2(result.reduce((sum, row) => sum + row.netVariance, 0)),
    };
  }

  async close(input: CloseDayInput, actorId: UUID): Promise<CashCountItem> {
    const closeDate = startOfDay(new Date(input.closeDate));

    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: input.accountId, deletedAt: null },
      select: { id: true, name: true, type: true, branchId: true, retainedFloat: true },
    });
    if (!account) throw new NotFoundError('Account not found');

    // A drawer is counted note by note; when the breakdown is given it decides the total,
    // because a figure typed beside a breakdown that contradicts it is the figure that is
    // wrong. A bank account has no notes and is reconciled against a statement.
    const denominations = input.denominations ?? null;
    const countedAmount = denominations
      ? denominationTotal(denominations as never)
      : round2(input.countedAmount);

    const row = await this.prisma.$transaction(async (tx) => {
      const lastClose = await this.posting.lastCloseDate(tx, account.id);
      const problem = closeProblem({ closeDate, lastCloseDate: lastClose, countedAmount });
      if (problem) throw new ValidationError(problem);

      // Re-checked inside the transaction: two people closing the same day at once would
      // otherwise both pass the check above and write two closes for one day.
      const existing = await tx.cashCount.findFirst({
        where: { accountId: account.id, closeDate, reopenedAt: null },
        select: { countNo: true },
      });
      if (existing) {
        throw new ValidationError(`That day is already closed as ${existing.countNo}`);
      }

      const expectedBalance = await this.expectedAt(account.id, closeDate);
      const variance = round2(countedAmount - expectedBalance);
      const countNo = await this.numbering.next(tx, 'CASH_COUNT', account.branchId, closeDate);

      // The adjusting entry is written before the close row, and carries allowClosedDay:
      // it belongs to the day being closed, which is about to be locked by this very
      // transaction. Without the flag it would be refused by the lock it is part of.
      const adjustment = input.postDifference ? adjustmentFor(variance) : null;
      const adjustmentEntry = adjustment
        ? await this.posting.post(
            tx,
            {
              accountId: account.id,
              entryDate: endOfDay(closeDate),
              type: 'ADJUSTMENT',
              direction: adjustment.direction,
              amount: adjustment.amount,
              source: 'CASH_COUNT',
              refType: 'CashCount',
              refNumber: countNo,
              narration:
                variance < 0
                  ? `Short on count of ${closeDate.toLocaleDateString('en-IN')}`
                  : `Over on count of ${closeDate.toLocaleDateString('en-IN')}`,
              allowClosedDay: true,
            },
            actorId,
          )
        : null;

      // What goes to an owner, written after the adjustment so it comes out of a drawer
      // that already agrees with the count — otherwise a short drawer could hand over
      // money the book still thinks is there.
      const handoverAmount = round2(input.handoverAmount ?? 0);
      const handoverAccountId = input.handoverAccountId ?? null;
      const handoverIssue = handoverProblem(handoverAmount, countedAmount, handoverAccountId);
      if (handoverIssue) throw new ValidationError(handoverIssue);

      let handoverEntryId: string | null = null;
      if (handoverAmount > 0 && handoverAccountId) {
        const owner = await tx.ledgerAccount.findFirst({
          where: { id: handoverAccountId, deletedAt: null },
          select: { id: true, name: true, type: true },
        });
        if (!owner) throw new ValidationError('That owner account no longer exists');
        if (owner.type !== 'OWNER') {
          throw new ValidationError(`${owner.name} is not an owner account`);
        }

        // Two rows, same as any transfer: the drawer's book shows money leaving and the
        // owner's shows it arriving. One signed row would leave the owner's balance
        // depending on somebody else's page to make sense.
        const out = await this.posting.post(
          tx,
          {
            accountId: account.id,
            entryDate: endOfDay(closeDate),
            type: 'TRANSFER',
            direction: 'OUT',
            amount: handoverAmount,
            counterAccountId: owner.id,
            source: 'CASH_COUNT',
            refType: 'CashCount',
            refNumber: countNo,
            narration: `Day's takings to ${owner.name}`,
            allowClosedDay: true,
          },
          actorId,
        );
        const into = await this.posting.post(
          tx,
          {
            accountId: owner.id,
            entryDate: endOfDay(closeDate),
            type: 'TRANSFER',
            direction: 'IN',
            amount: handoverAmount,
            counterAccountId: account.id,
            source: 'CASH_COUNT',
            refType: 'CashCount',
            refNumber: countNo,
            narration: `${account.name}, ${closeDate.toLocaleDateString('en-IN')}`,
            allowClosedDay: true,
          },
          actorId,
        );
        await tx.cashEntry.update({ where: { id: out.id }, data: { pairedEntryId: into.id } });
        await tx.cashEntry.update({ where: { id: into.id }, data: { pairedEntryId: out.id } });
        handoverEntryId = out.id;
      }

      const created = await tx.cashCount.create({
        data: {
          countNo,
          accountId: account.id,
          branchId: account.branchId,
          closeDate,
          expectedBalance,
          countedAmount,
          variance,
          handoverAmount,
          handoverAccountId,
          handoverEntryId,
          retainedAmount: round2(countedAmount - handoverAmount),
          denominations: denominations ?? undefined,
          adjustmentEntryId: adjustmentEntry?.id ?? null,
          notes: input.notes?.trim() || null,
          createdBy: actorId,
        },
        include,
      });

      // The entries know which count they belong to only once the count exists.
      const written = [adjustmentEntry?.id, handoverEntryId].filter((id): id is string => !!id);
      if (written.length > 0) {
        await tx.cashEntry.updateMany({
          where: { OR: [{ id: { in: written } }, { pairedEntryId: { in: written } }] },
          data: { refId: created.id },
        });
      }

      return created;
    });

    const names = await this.closerNames([row]);
    return this.toItem(row, row.createdBy ? (names.get(row.createdBy) ?? null) : null);
  }

  async reopen(id: UUID, reason: string, actorId: UUID): Promise<CashCountItem> {
    if (!reason.trim()) throw new ValidationError('Say why the day is being reopened');

    const row = await this.prisma.$transaction(async (tx) => {
      const count = await tx.cashCount.findUnique({
        where: { id },
        select: { id: true, countNo: true, accountId: true, closeDate: true, reopenedAt: true },
      });
      if (!count) throw new NotFoundError('Close not found');
      if (count.reopenedAt) throw new ValidationError('That day has already been reopened');

      // Only the most recent close can be reopened. Reopening an older one would leave a
      // day writable underneath a later count that has already been signed off on.
      const latest = await tx.cashCount.findFirst({
        where: { accountId: count.accountId, reopenedAt: null },
        orderBy: { closeDate: 'desc' },
        select: { id: true, countNo: true, closeDate: true },
      });
      if (latest && latest.id !== count.id) {
        throw new ValidationError(
          `${latest.countNo} closed ${latest.closeDate.toLocaleDateString('en-IN')} and would sit on top of this one. Reopen that first.`,
        );
      }

      // Everything the close wrote is undone with contra rows: the adjustment, and both
      // legs of any handover. The owner gives the money back on paper, because a count
      // that no longer stands cannot be what justified handing it over.
      await this.posting.reverseFor(
        tx,
        'CashCount',
        count.id,
        `${count.countNo} reopened — ${reason.trim()}`,
        actorId,
      );

      await tx.cashCount.update({
        where: { id },
        data: { reopenedAt: new Date(), reopenedBy: actorId, reopenReason: reason.trim() },
      });

      return tx.cashCount.findFirstOrThrow({ where: { id }, include });
    });

    const names = await this.closerNames([row]);
    return this.toItem(row, row.createdBy ? (names.get(row.createdBy) ?? null) : null);
  }
}
