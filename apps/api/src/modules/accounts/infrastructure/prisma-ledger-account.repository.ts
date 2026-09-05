import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { financialYearStart, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  ExpenseHeadItem,
  LedgerAccountItem,
  LedgerAccountType,
  SaveExpenseHeadInput,
  SaveLedgerAccountInput,
  UUID,
} from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  LedgerAccountFilter,
  LedgerAccountRepository,
} from '../domain/ledger-account.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;

const include = { branch: { select: { name: true } } } satisfies Prisma.LedgerAccountInclude;
type Row = Prisma.LedgerAccountGetPayload<{ include: typeof include }>;

@Injectable()
export class PrismaLedgerAccountRepository implements LedgerAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * An account's balance: its opening plus every entry since — reversed ones included.
   *
   * Reversing writes a contra row rather than removing anything, so the pair cancels on
   * its own. Filtering reversed rows out as well would take the money off twice.
   *
   * Counted, never stored. A stored balance and a ledger disagree eventually — a
   * mis-posted correction, a rolled-back transaction — and the ledger is the one that can
   * be audited, so it is the one that decides.
   */
  private async balances(accountIds: UUID[]): Promise<Map<string, number>> {
    if (accountIds.length === 0) return new Map();
    const sums = await this.prisma.cashEntry.groupBy({
      by: ['accountId', 'direction'],
      where: { accountId: { in: accountIds } },
      _sum: { amount: true },
    });

    const moved = new Map<string, number>();
    for (const row of sums) {
      const signed = Number(row._sum.amount ?? 0) * (row.direction === 'IN' ? 1 : -1);
      moved.set(row.accountId, round2((moved.get(row.accountId) ?? 0) + signed));
    }
    return moved;
  }

  private toItem(row: Row, moved: number): LedgerAccountItem {
    const openingBalance = Number(row.openingBalance);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      ifsc: row.ifsc,
      openingBalance,
      openingDate: row.openingDate.toISOString(),
      retainedFloat: Number(row.retainedFloat),
      currentBalance: round2(openingBalance + moved),
      isActive: row.isActive,
      notes: row.notes,
      version: row.version,
    };
  }

  async list(filter: LedgerAccountFilter): Promise<LedgerAccountItem[]> {
    const rows = await this.prisma.ledgerAccount.findMany({
      where: {
        deletedAt: null,
        ...(filter.branchId ? { branchId: filter.branchId } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.includeInactive ? {} : { isActive: true }),
      },
      include,
      // Cash first, then banks, then owners: a drawer is what someone is usually after,
      // and money already handed over is the thing they look at last.
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
    const moved = await this.balances(rows.map((row) => row.id));
    return rows.map((row) => this.toItem(row, moved.get(row.id) ?? 0));
  }

  async findById(id: UUID): Promise<LedgerAccountItem | null> {
    const row = await this.prisma.ledgerAccount.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    if (!row) return null;
    const moved = await this.balances([id]);
    return this.toItem(row, moved.get(id) ?? 0);
  }

  /**
   * Checks the shape of an account before it is written.
   *
   * A bank account without a bank name is unusable at reconciliation time, and a cash
   * drawer with no branch belongs to nobody — neither is worth discovering later.
   */
  private async assertShape(data: SaveLedgerAccountInput, id?: UUID): Promise<void> {
    if (!data.name?.trim()) throw new ValidationError('Give the account a name');

    if (data.type === 'BANK' && !data.bankName?.trim()) {
      throw new ValidationError('A bank account needs the bank name');
    }
    if (data.type === 'CASH' && !data.branchId) {
      throw new ValidationError('A cash drawer belongs to a branch — choose one');
    }
    // An owner is a person, not a branch. Tying one to a branch would mean a second row
    // for the same person the day they start taking cash from a second counter, and their
    // balance would then be split across rows that add up to nothing anyone asked for.
    if (data.type === 'OWNER' && data.branchId) {
      throw new ValidationError('An owner holds money for the company, not for one branch');
    }
    if (data.type !== 'CASH' && data.retainedFloat) {
      throw new ValidationError('Only a cash drawer keeps a float back at close');
    }
    if (data.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: data.branchId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) throw new ValidationError('That branch no longer exists');
    }
    if (data.code) {
      const clash = await this.prisma.ledgerAccount.findFirst({
        where: {
          code: { equals: data.code.trim(), mode: 'insensitive' },
          deletedAt: null,
          ...(id ? { NOT: { id } } : {}),
        },
        select: { name: true },
      });
      if (clash) throw new ValidationError(`Code ${data.code} is already used by ${clash.name}`);
    }
  }

  async nextCode(type: LedgerAccountType, branchId: UUID | null): Promise<string> {
    const branch = branchId
      ? await this.prisma.branch.findFirst({ where: { id: branchId }, select: { code: true } })
      : null;
    const suffix = type === 'CASH' ? 'CASH' : type === 'BANK' ? 'BANK' : 'OWNER';
    const stem = `${branch?.code ?? 'CO'}-${suffix}`;
    const taken = await this.prisma.ledgerAccount.count({
      where: { code: { startsWith: stem }, deletedAt: null },
    });
    return taken === 0 ? stem : `${stem}-${taken + 1}`;
  }

  async create(data: SaveLedgerAccountInput, createdBy: UUID): Promise<LedgerAccountItem> {
    await this.assertShape(data);
    const code = data.code?.trim() || (await this.nextCode(data.type, data.branchId ?? null));

    const row = await this.prisma.ledgerAccount.create({
      data: {
        code,
        name: data.name.trim(),
        type: data.type,
        branchId: data.branchId ?? null,
        bankName: data.bankName?.trim() || null,
        accountNumber: data.accountNumber?.trim() || null,
        ifsc: data.ifsc?.trim()?.toUpperCase() || null,
        openingBalance: data.openingBalance ?? 0,
        openingDate: data.openingDate ? new Date(data.openingDate) : new Date(),
        retainedFloat: data.retainedFloat ?? 0,
        isActive: data.isActive ?? true,
        notes: data.notes?.trim() || null,
        createdBy,
      },
      include,
    });
    return this.toItem(row, 0);
  }

  async update(
    id: UUID,
    data: SaveLedgerAccountInput,
    updatedBy: UUID,
  ): Promise<LedgerAccountItem> {
    const existing = await this.prisma.ledgerAccount.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Account not found');
    await this.assertShape(data, id);

    // The opening balance is only movable while the book is empty. Once entries exist,
    // changing it silently restates every balance since, and nobody would see why.
    if (data.openingBalance !== undefined) {
      const entries = await this.prisma.cashEntry.count({ where: { accountId: id } });
      if (entries > 0) {
        const current = await this.prisma.ledgerAccount.findFirstOrThrow({
          where: { id },
          select: { openingBalance: true },
        });
        if (round2(Number(current.openingBalance)) !== round2(data.openingBalance)) {
          throw new ValidationError(
            `${entries} entries have been posted to this account, so its opening balance is fixed. Post an adjusting entry instead.`,
          );
        }
      }
    }

    const row = await this.prisma.ledgerAccount.update({
      where: { id },
      data: {
        ...(data.code ? { code: data.code.trim() } : {}),
        name: data.name.trim(),
        type: data.type,
        branchId: data.branchId ?? null,
        bankName: data.bankName?.trim() || null,
        accountNumber: data.accountNumber?.trim() || null,
        ifsc: data.ifsc?.trim()?.toUpperCase() || null,
        ...(data.openingBalance !== undefined ? { openingBalance: data.openingBalance } : {}),
        ...(data.openingDate ? { openingDate: new Date(data.openingDate) } : {}),
        ...(data.retainedFloat !== undefined ? { retainedFloat: data.retainedFloat } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        notes: data.notes?.trim() || null,
        updatedBy,
        version: { increment: 1 },
      },
      include,
    });
    const moved = await this.balances([id]);
    return this.toItem(row, moved.get(id) ?? 0);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const entries = await this.prisma.cashEntry.count({ where: { accountId: id } });
    if (entries > 0) {
      throw new ValidationError(
        `This account has ${entries} entries and cannot be deleted — its history would lose its home. Mark it inactive instead.`,
      );
    }
    await this.prisma.ledgerAccount.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, version: { increment: 1 } },
    });
  }

  async listExpenseHeads(includeInactive: boolean): Promise<ExpenseHeadItem[]> {
    const rows = await this.prisma.expenseHead.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });

    // Netted by direction rather than summed: a reversal carries the same head, so an
    // expense of 5,000 that was corrected has an OUT row and an IN row, and only the
    // difference was really spent. Summing the amounts would report 10,000.
    const spent = await this.prisma.cashEntry.groupBy({
      by: ['expenseHeadId', 'direction'],
      where: {
        expenseHeadId: { in: rows.map((row) => row.id) },
        entryDate: { gte: financialYearStart(new Date()) },
      },
      _sum: { amount: true },
    });
    const spentByHead = new Map<string, number>();
    for (const row of spent) {
      if (!row.expenseHeadId) continue;
      const signed = Number(row._sum.amount ?? 0) * (row.direction === 'OUT' ? 1 : -1);
      spentByHead.set(row.expenseHeadId, round2((spentByHead.get(row.expenseHeadId) ?? 0) + signed));
    }

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      notes: row.notes,
      spentThisYear: spentByHead.get(row.id) ?? 0,
      version: row.version,
    }));
  }

  private async assertHeadShape(data: SaveExpenseHeadInput, id?: UUID): Promise<void> {
    if (!data.name?.trim()) throw new ValidationError('Give the head a name');
    const clash = await this.prisma.expenseHead.findFirst({
      where: {
        name: { equals: data.name.trim(), mode: 'insensitive' },
        deletedAt: null,
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ValidationError(`${data.name} already exists`);
  }

  async createExpenseHead(
    data: SaveExpenseHeadInput,
    createdBy: UUID,
  ): Promise<ExpenseHeadItem> {
    await this.assertHeadShape(data);
    const count = await this.prisma.expenseHead.count();
    await this.prisma.expenseHead.create({
      data: {
        code: data.code?.trim() || `EXP-${String(count + 1).padStart(3, '0')}`,
        name: data.name.trim(),
        isActive: data.isActive ?? true,
        notes: data.notes?.trim() || null,
        createdBy,
      },
    });
    return (await this.listExpenseHeads(true)).find((head) => head.name === data.name.trim())!;
  }

  async updateExpenseHead(
    id: UUID,
    data: SaveExpenseHeadInput,
    updatedBy: UUID,
  ): Promise<ExpenseHeadItem> {
    const existing = await this.prisma.expenseHead.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Expense head not found');
    await this.assertHeadShape(data, id);

    await this.prisma.expenseHead.update({
      where: { id },
      data: {
        ...(data.code ? { code: data.code.trim() } : {}),
        name: data.name.trim(),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        notes: data.notes?.trim() || null,
        updatedBy,
        version: { increment: 1 },
      },
    });
    return (await this.listExpenseHeads(true)).find((head) => head.id === id)!;
  }

  async softDeleteExpenseHead(id: UUID, deletedBy: UUID): Promise<void> {
    const used = await this.prisma.cashEntry.count({ where: { expenseHeadId: id } });
    if (used > 0) {
      throw new ValidationError(
        `${used} expenses have been booked under this head, so it cannot be deleted. Mark it inactive instead.`,
      );
    }
    await this.prisma.expenseHead.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy, version: { increment: 1 } },
    });
  }
}
