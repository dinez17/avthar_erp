import type { DocumentType } from '@prisma/client';
import { DocumentNumberService, FALLBACK_PREFIX } from './document-number.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * A stand-in for the two tables, behaving the way Postgres does: the upsert is atomic,
 * so successive calls cannot be handed the same number.
 */
const fakeDb = (
  settings: {
    documentType: DocumentType;
    branchId: string | null;
    prefix: string;
    separator?: string;
    padding?: number;
    resetAnnually?: boolean;
  }[] = [],
) => {
  const counters = new Map<string, number>();
  const rows = settings.map((setting) => ({
    separator: '/',
    padding: 4,
    resetAnnually: true,
    ...setting,
  }));

  return {
    counters,
    numberSeriesSetting: {
      findMany: jest.fn(({ where }: { where: { documentType: DocumentType; branchId: unknown } }) =>
        Promise.resolve(
          rows.filter((row) => {
            if (row.documentType !== where.documentType) return false;
            if (where.branchId === null) return row.branchId === null;
            const wanted = (where.branchId as { in: string[] }).in;
            return row.branchId !== null && wanted.includes(row.branchId);
          }),
        ),
      ),
      findFirst: jest.fn(({ where }: { where: { documentType: DocumentType } }) =>
        Promise.resolve(
          rows.find((row) => row.documentType === where.documentType && row.branchId === null) ??
            null,
        ),
      ),
    },
    numberSequence: {
      upsert: jest.fn(
        ({
          where,
        }: {
          where: {
            sequenceKey: { documentType: DocumentType; scope: string; financialYear: string };
          };
        }) => {
          const key = JSON.stringify(where.sequenceKey);
          const next = (counters.get(key) ?? 0) + 1;
          counters.set(key, next);
          return Promise.resolve({ lastNumber: next });
        },
      ),
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
  };
};

const service = (db: ReturnType<typeof fakeDb>): DocumentNumberService =>
  new DocumentNumberService(db as unknown as PrismaService);

const APRIL = new Date(2026, 3, 10);
const MARCH = new Date(2026, 2, 31);

describe('DocumentNumberService.next', () => {
  it('falls back to the prefix the code has always used', async () => {
    const db = fakeDb();
    const number = await service(db).next(db as never, 'SALES_INVOICE', 'b1', APRIL);
    expect(number).toBe(`${FALLBACK_PREFIX.SALES_INVOICE}/26-27/0001`);
  });

  it("uses the branch's own prefix when it has one", async () => {
    const db = fakeDb([{ documentType: 'SALES_INVOICE', branchId: 'b1', prefix: 'AMB' }]);
    expect(await service(db).next(db as never, 'SALES_INVOICE', 'b1', APRIL)).toBe(
      'AMB/26-27/0001',
    );
  });

  it('falls back to a company-wide series before the built-in default', async () => {
    const db = fakeDb([{ documentType: 'SALES_INVOICE', branchId: null, prefix: 'TIL' }]);
    expect(await service(db).next(db as never, 'SALES_INVOICE', 'b9', APRIL)).toBe(
      'TIL/26-27/0001',
    );
  });

  it('never hands the same number to two callers', async () => {
    const db = fakeDb([{ documentType: 'SALES_INVOICE', branchId: 'b1', prefix: 'AMB' }]);
    const numbering = service(db);
    const issued = await Promise.all([
      numbering.next(db as never, 'SALES_INVOICE', 'b1', APRIL),
      numbering.next(db as never, 'SALES_INVOICE', 'b1', APRIL),
      numbering.next(db as never, 'SALES_INVOICE', 'b1', APRIL),
    ]);
    expect(new Set(issued).size).toBe(3);
    expect(issued).toEqual(['AMB/26-27/0001', 'AMB/26-27/0002', 'AMB/26-27/0003']);
  });

  it('counts each branch separately', async () => {
    const db = fakeDb([
      { documentType: 'SALES_INVOICE', branchId: 'b1', prefix: 'AMB' },
      { documentType: 'SALES_INVOICE', branchId: 'b2', prefix: 'HO' },
    ]);
    const numbering = service(db);
    await numbering.next(db as never, 'SALES_INVOICE', 'b1', APRIL);
    expect(await numbering.next(db as never, 'SALES_INVOICE', 'b2', APRIL)).toBe('HO/26-27/0001');
  });

  it('counts each document type separately', async () => {
    const db = fakeDb();
    const numbering = service(db);
    await numbering.next(db as never, 'SALES_INVOICE', 'b1', APRIL);
    expect(await numbering.next(db as never, 'QUOTATION', 'b1', APRIL)).toBe(
      `${FALLBACK_PREFIX.QUOTATION}/26-27/0001`,
    );
  });

  it('starts again on 1 April', async () => {
    const db = fakeDb([{ documentType: 'SALES_INVOICE', branchId: 'b1', prefix: 'AMB' }]);
    const numbering = service(db);
    await numbering.next(db as never, 'SALES_INVOICE', 'b1', MARCH);
    await numbering.next(db as never, 'SALES_INVOICE', 'b1', MARCH);
    // A day later, and in a different year.
    expect(await numbering.next(db as never, 'SALES_INVOICE', 'b1', APRIL)).toBe('AMB/26-27/0001');
  });

  it('keeps counting when the series does not reset', async () => {
    const db = fakeDb([
      { documentType: 'SALES_INVOICE', branchId: 'b1', prefix: 'AMB', resetAnnually: false },
    ]);
    const numbering = service(db);
    await numbering.next(db as never, 'SALES_INVOICE', 'b1', MARCH);
    expect(await numbering.next(db as never, 'SALES_INVOICE', 'b1', APRIL)).toBe('AMB/0002');
  });

  it('never gives two branches the same cash entry number', async () => {
    // cash_entries.entryNumber is unique across the whole table. Counting per branch gave
    // every branch its own sequence, so two branches on the built-in CE prefix both
    // reached CE/26-27/0001 and the second insert failed. This is that bug.
    const db = fakeDb();
    const numbering = service(db);
    const first = await numbering.next(db as never, 'CASH_ENTRY', 'b1', APRIL);
    const second = await numbering.next(db as never, 'CASH_ENTRY', 'b2', APRIL);
    expect(second).not.toBe(first);
    expect(second).toBe(`${FALLBACK_PREFIX.CASH_ENTRY}/26-27/0002`);
  });

  it('counts an account with no branch on the same cash series', async () => {
    // An owner's holding belongs to no branch, so a day close hands cash from a branch
    // drawer to a branchless account. Both legs must draw from one counter.
    const db = fakeDb();
    const numbering = service(db);
    await numbering.next(db as never, 'CASH_ENTRY', 'b1', APRIL);
    expect(await numbering.next(db as never, 'CASH_ENTRY', null, APRIL)).toBe(
      `${FALLBACK_PREFIX.CASH_ENTRY}/26-27/0002`,
    );
  });

  it('keeps expenses and day closes off the cash entry series', async () => {
    const db = fakeDb();
    const numbering = service(db);
    await numbering.next(db as never, 'CASH_ENTRY', 'b1', APRIL);
    expect(await numbering.next(db as never, 'EXPENSE', 'b1', APRIL)).toBe(
      `${FALLBACK_PREFIX.EXPENSE}/26-27/0001`,
    );
    expect(await numbering.next(db as never, 'CASH_COUNT', 'b1', APRIL)).toBe(
      `${FALLBACK_PREFIX.CASH_COUNT}/26-27/0001`,
    );
  });

  it('ignores the branch for a master that belongs to the company', async () => {
    const db = fakeDb();
    const numbering = service(db);
    await numbering.next(db as never, 'TRANSPORTER', 'b1', APRIL);
    // A different branch continues the same company-wide count.
    expect(await numbering.next(db as never, 'TRANSPORTER', 'b2', APRIL)).toBe(
      `${FALLBACK_PREFIX.TRANSPORTER}/26-27/0002`,
    );
  });

  it('honours a separator and padding of its own', async () => {
    const db = fakeDb([
      {
        documentType: 'SALES_INVOICE',
        branchId: 'b1',
        prefix: 'AMB',
        separator: '-',
        padding: 6,
      },
    ]);
    expect(await service(db).next(db as never, 'SALES_INVOICE', 'b1', APRIL)).toBe(
      'AMB-26-27-000001',
    );
  });
});

describe('DocumentNumberService.peek', () => {
  it('shows the next number without taking it', async () => {
    const db = fakeDb([{ documentType: 'SALES_INVOICE', branchId: 'b1', prefix: 'AMB' }]);
    const numbering = service(db);
    expect(await numbering.peek('SALES_INVOICE', 'b1', APRIL)).toBe('AMB/26-27/0001');
    expect(db.numberSequence.upsert).not.toHaveBeenCalled();
  });
});
