import { ValidationError } from '@tiles-erp/shared';
import { CashPostingService, type PostCashEntry } from './cash-posting.service';
import type { DocumentNumberService } from '../../../core/numbering/document-number.service';

interface FakeAccount {
  id: string;
  name: string;
  type: 'CASH' | 'BANK';
  branchId: string | null;
  openingBalance: number;
  isActive?: boolean;
  deletedAt?: Date | null;
}

interface FakeEntry {
  id: string;
  entryNumber: string;
  accountId: string;
  branchId: string | null;
  entryDate: Date;
  type: string;
  direction: 'IN' | 'OUT';
  amount: number;
  expenseHeadId: string | null;
  counterAccountId: string | null;
  pairedEntryId: string | null;
  refType: string | null;
  refId: string | null;
  refNumber: string | null;
  narration: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  reversalEntryId: string | null;
}

/**
 * A stand-in for the two tables. Only the shapes the service actually reads are modelled;
 * the point is to exercise the rules, not to reimplement Postgres.
 */
const fakeDb = (
  accounts: FakeAccount[],
  heads: string[] = [],
  /** Days already closed, per account, so the lock can be exercised. */
  closes: { accountId: string; closeDate: Date }[] = [],
) => {
  const entries: FakeEntry[] = [];
  let sequence = 0;

  return {
    entries,
    cashCount: {
      findFirst: ({ where }: { where: { accountId: string } }) =>
        Promise.resolve(
          closes
            .filter((close) => close.accountId === where.accountId)
            .sort((a, b) => b.closeDate.getTime() - a.closeDate.getTime())[0] ?? null,
        ),
    },
    ledgerAccount: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          accounts.find((account) => account.id === where.id && !account.deletedAt) ?? null,
        ),
    },
    expenseHead: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(heads.includes(where.id) ? { id: where.id } : null),
    },
    cashEntry: {
      groupBy: ({ where }: { where: { accountId: string } }) => {
        // Every row, reversed included — the contra is what cancels it.
        const relevant = entries.filter((entry) => entry.accountId === where.accountId);
        return Promise.resolve(
          (['IN', 'OUT'] as const).map((direction) => ({
            direction,
            _sum: {
              amount: relevant
                .filter((entry) => entry.direction === direction)
                .reduce((sum, entry) => sum + entry.amount, 0),
            },
          })),
        );
      },
      create: ({ data }: { data: Record<string, unknown> }) => {
        sequence += 1;
        const row = {
          id: `e${sequence}`,
          pairedEntryId: null,
          reversedAt: null,
          ...data,
        } as unknown as FakeEntry;
        entries.push(row);
        return Promise.resolve({ id: row.id });
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(entries.find((entry) => entry.id === where.id) ?? null),
      findMany: ({
        where,
      }: {
        where: { refType: string; refId: string; reversedAt: null };
      }) =>
        Promise.resolve(
          entries.filter(
            (entry) =>
              entry.refType === where.refType &&
              entry.refId === where.refId &&
              entry.reversedAt === null,
          ),
        ),
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = entries.find((entry) => entry.id === where.id);
        Object.assign(row as object, data);
        return Promise.resolve(row);
      },
    },
  };
};

let counter = 0;
const numbering = {
  next: jest.fn(() => {
    counter += 1;
    return Promise.resolve(`CE/26-27/${String(counter).padStart(4, '0')}`);
  }),
} as unknown as DocumentNumberService;

const service = new CashPostingService(numbering);
const ACTOR = 'user-1';

const DRAWER: FakeAccount = {
  id: 'cash',
  name: 'HO drawer',
  type: 'CASH',
  branchId: 'b1',
  openingBalance: 5000,
  isActive: true,
};
const BANK: FakeAccount = {
  id: 'bank',
  name: 'Axis 6613',
  type: 'BANK',
  branchId: 'b1',
  openingBalance: 0,
  isActive: true,
};

const entry = (over: Partial<PostCashEntry> = {}): PostCashEntry => ({
  accountId: 'cash',
  type: 'RECEIPT',
  direction: 'IN',
  amount: 1000,
  ...over,
});

beforeEach(() => {
  counter = 0;
});

describe('CashPostingService.post', () => {
  it('adds the opening balance and every entry since', async () => {
    const db = fakeDb([DRAWER]);
    await service.post(db as never, entry({ amount: 2000 }), ACTOR);
    await service.post(db as never, entry({ direction: 'OUT', type: 'PAYMENT', amount: 500 }), ACTOR);
    expect(await service.balanceOf(db as never, 'cash')).toBe(6500);
  });

  it('refuses to pay more out of a drawer than is in it', async () => {
    const db = fakeDb([DRAWER]);
    await expect(
      service.post(db as never, entry({ direction: 'OUT', type: 'PAYMENT', amount: 6000 }), ACTOR),
    ).rejects.toThrow(ValidationError);
  });

  it('lets a bank account go overdrawn — that is what an overdraft is', async () => {
    const db = fakeDb([BANK]);
    await expect(
      service.post(
        db as never,
        entry({ accountId: 'bank', direction: 'OUT', type: 'PAYMENT', amount: 40000 }),
        ACTOR,
      ),
    ).resolves.toBeDefined();
  });

  it('names the account and both figures when a drawer is short', async () => {
    const db = fakeDb([DRAWER]);
    await expect(
      service.post(db as never, entry({ direction: 'OUT', type: 'PAYMENT', amount: 6000 }), ACTOR),
    ).rejects.toThrow(/HO drawer holds 5000.00.*6000.00/);
  });

  it('will not post to an account that has been closed', async () => {
    const db = fakeDb([{ ...BANK, isActive: false }]);
    await expect(
      service.post(db as never, entry({ accountId: 'bank' }), ACTOR),
    ).rejects.toThrow(/inactive/);
  });

  it('rejects an amount of nothing', async () => {
    const db = fakeDb([DRAWER]);
    await expect(service.post(db as never, entry({ amount: 0 }), ACTOR)).rejects.toThrow(
      ValidationError,
    );
  });

  it('rejects an expense head that has been deleted', async () => {
    const db = fakeDb([DRAWER], ['head-1']);
    await expect(
      service.post(
        db as never,
        entry({ type: 'EXPENSE', direction: 'OUT', expenseHeadId: 'gone' }),
        ACTOR,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("takes the entry's branch from the account, not the caller", async () => {
    const db = fakeDb([DRAWER]);
    await service.post(db as never, entry(), ACTOR);
    expect(db.entries[0]!.branchId).toBe('b1');
  });
});

describe('CashPostingService — the day-close lock', () => {
  const CLOSED = new Date(2026, 7, 14);

  it('refuses an entry dated inside a closed day', async () => {
    const db = fakeDb([DRAWER], [], [{ accountId: 'cash', closeDate: CLOSED }]);
    await expect(
      service.post(db as never, entry({ entryDate: new Date(2026, 7, 14, 16) }), ACTOR),
    ).rejects.toThrow(/closed up to/);
  });

  it('refuses an entry dated before a closed day', async () => {
    const db = fakeDb([DRAWER], [], [{ accountId: 'cash', closeDate: CLOSED }]);
    await expect(
      service.post(db as never, entry({ entryDate: new Date(2026, 6, 1) }), ACTOR),
    ).rejects.toThrow(/closed up to/);
  });

  it('accepts an entry the day after', async () => {
    const db = fakeDb([DRAWER], [], [{ accountId: 'cash', closeDate: CLOSED }]);
    await expect(
      service.post(db as never, entry({ entryDate: new Date(2026, 7, 15) }), ACTOR),
    ).resolves.toBeDefined();
  });

  it('locks only the account that was closed', async () => {
    const db = fakeDb([DRAWER, BANK], [], [{ accountId: 'cash', closeDate: CLOSED }]);
    await expect(
      service.post(
        db as never,
        entry({ accountId: 'bank', entryDate: new Date(2026, 7, 14) }),
        ACTOR,
      ),
    ).resolves.toBeDefined();
  });

  it('lets the close write its own adjusting entry into the day it is locking', async () => {
    const db = fakeDb([DRAWER], [], [{ accountId: 'cash', closeDate: CLOSED }]);
    await expect(
      service.post(
        db as never,
        entry({
          type: 'ADJUSTMENT',
          direction: 'OUT',
          amount: 250,
          entryDate: new Date(2026, 7, 14, 23, 59),
          allowClosedDay: true,
        }),
        ACTOR,
      ),
    ).resolves.toBeDefined();
  });
});

describe('CashPostingService.reverse', () => {
  it('writes the mirror image and leaves the original standing', async () => {
    const db = fakeDb([DRAWER]);
    const posted = await service.post(db as never, entry({ amount: 1200 }), ACTOR);
    await service.reverse(db as never, posted.id, 'Wrong account', ACTOR);

    expect(db.entries).toHaveLength(2);
    expect(db.entries[1]!.direction).toBe('OUT');
    expect(db.entries[1]!.amount).toBe(1200);
    expect(db.entries[0]!.reversedAt).not.toBeNull();
  });

  it('leaves the balance where it started', async () => {
    const db = fakeDb([DRAWER]);
    const posted = await service.post(db as never, entry({ amount: 1200 }), ACTOR);
    await service.reverse(db as never, posted.id, 'Wrong account', ACTOR);
    expect(await service.balanceOf(db as never, 'cash')).toBe(5000);
  });

  it('says on the contra row what it reverses and why', async () => {
    const db = fakeDb([DRAWER]);
    const posted = await service.post(db as never, entry(), ACTOR);
    await service.reverse(db as never, posted.id, 'Duplicate', ACTOR);
    expect(db.entries[1]!.narration).toContain('Duplicate');
    expect(db.entries[1]!.refNumber).toBe(db.entries[0]!.entryNumber);
  });

  it('refuses to reverse the same entry twice', async () => {
    const db = fakeDb([DRAWER]);
    const posted = await service.post(db as never, entry(), ACTOR);
    await service.reverse(db as never, posted.id, 'Wrong account', ACTOR);
    await expect(service.reverse(db as never, posted.id, 'Again', ACTOR)).rejects.toThrow(
      /already been reversed/,
    );
  });

  it('insists on a reason', async () => {
    const db = fakeDb([DRAWER]);
    const posted = await service.post(db as never, entry(), ACTOR);
    await expect(service.reverse(db as never, posted.id, '   ', ACTOR)).rejects.toThrow(
      ValidationError,
    );
  });

  it('takes the other leg of a transfer with it', async () => {
    const db = fakeDb([DRAWER, BANK]);
    const out = await service.post(
      db as never,
      entry({ type: 'TRANSFER', direction: 'OUT', amount: 2000, counterAccountId: 'bank' }),
      ACTOR,
    );
    const into = await service.post(
      db as never,
      entry({
        accountId: 'bank',
        type: 'TRANSFER',
        direction: 'IN',
        amount: 2000,
        counterAccountId: 'cash',
      }),
      ACTOR,
    );
    db.entries[0]!.pairedEntryId = into.id;
    db.entries[1]!.pairedEntryId = out.id;

    await service.reverse(db as never, out.id, 'Sent to the wrong bank', ACTOR);

    // Both legs reversed, so neither account is left holding money the other lost.
    expect(await service.balanceOf(db as never, 'cash')).toBe(5000);
    expect(await service.balanceOf(db as never, 'bank')).toBe(0);
  });
});

describe('CashPostingService.reverseFor', () => {
  it('takes back everything a cancelled document put in the book', async () => {
    const db = fakeDb([DRAWER]);
    await service.post(
      db as never,
      entry({ amount: 3000, refType: 'CustomerReceipt', refId: 'r1' }),
      ACTOR,
    );
    await service.post(
      db as never,
      entry({ accountId: 'cash', amount: 1000, refType: 'CustomerReceipt', refId: 'r1' }),
      ACTOR,
    );
    await service.post(db as never, entry({ amount: 500 }), ACTOR);

    await service.reverseFor(db as never, 'CustomerReceipt', 'r1', 'Receipt cancelled', ACTOR);

    // The unrelated 500 stays; the receipt's 4,000 is undone.
    expect(await service.balanceOf(db as never, 'cash')).toBe(5500);
  });
});
