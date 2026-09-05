import type { PrismaClient } from '@prisma/client';
import type { SixOrbitClient } from './sixorbit.client';
import { SixOrbitProductPushService } from './sixorbit-product-push.service';

interface ProductRow {
  id: string;
  deletedAt: Date | null;
  name: string;
  sku: string;
  hsnCode: string;
  gstRate: number;
  sellingRate: number | null;
  purchaseRate: number | null;
  mrp: number | null;
  piecesPerBox: number;
  sqftPerBox: number;
  barcode: string | null;
  isActive: boolean;
  sixorbitId: string | null;
  sixorbitRaw: Record<string, unknown> | null;
  brand: { sixorbitId: string | null } | null;
  category: { sixorbitId: string | null } | null;
  sixorbitAttributes: { aid: string; name: string; avid: string; value: string }[];
}

const product = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: 'p1',
  deletedAt: null,
  name: 'AV ROVEN GREY E 4X2 (3) (GLITTER)',
  sku: '17361',
  hsnCode: '69072100',
  gstRate: 18,
  sellingRate: 635.59,
  purchaseRate: 109,
  mrp: null,
  piecesPerBox: 3,
  sqftPerBox: 24,
  barcode: null,
  isActive: true,
  sixorbitId: null,
  sixorbitRaw: null,
  brand: { sixorbitId: '410012486' },
  category: { sixorbitId: '410053695' },
  sixorbitAttributes: [],
  ...over,
});

function stubPrisma(row: ProductRow | null): {
  prisma: PrismaClient;
  updates: Record<string, unknown>[];
} {
  const updates: Record<string, unknown>[] = [];
  const prisma = {
    product: {
      findUnique: () => Promise.resolve(row),
      update: ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({});
      },
    },
  } as unknown as PrismaClient;
  return { prisma, updates };
}

interface Call {
  task: string;
  data?: unknown;
  params?: Record<string, unknown>;
}

/** Records what was sent, and answers each task from a script. */
function stubClient(script: {
  search?: { variations: { isvid: string; variation_number: string }[] } | { fail: string };
  write?: { isvid?: string } | { throw: Error };
}): { client: SixOrbitClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    call: (opts: { spec: { task: string }; params?: Record<string, unknown> }) => {
      calls.push({ task: opts.spec.task, params: opts.params });
      const s = script.search;
      if (s && 'fail' in s) {
        return Promise.resolve({ ok: false, kind: 'TRANSPORT', resultCode: null, message: s.fail });
      }
      return Promise.resolve({
        ok: true,
        data: s ?? { variations: [] },
        resultCode: '20003',
        message: null,
      });
    },
    callOrThrow: (opts: { spec: { task: string }; data?: unknown }) => {
      calls.push({ task: opts.spec.task, data: opts.data });
      const w = script.write;
      if (w && 'throw' in w) return Promise.reject(w.throw);
      return Promise.resolve(w ?? {});
    },
  } as unknown as SixOrbitClient;
  return { client, calls };
}

describe('SixOrbitProductPushService — the duplicate guard', () => {
  it('searches for the sku before creating anything', async () => {
    // No task in their API takes an external reference, so this lookup is the only thing
    // standing between a timed-out create and a duplicate product.
    const { prisma } = stubPrisma(product());
    const { client, calls } = stubClient({ write: { isvid: '999' } });

    await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(calls[0]?.task).toBe('variation/fetch');
    expect(calls[0]?.params?.searchtext).toBe('17361');
    expect(calls[1]?.task).toBe('variation/create_variation_submit');
  });

  it('edits the existing variation instead of creating a second one', async () => {
    const { prisma, updates } = stubPrisma(product());
    const { client, calls } = stubClient({
      search: { variations: [{ isvid: '160595', variation_number: '17361' }] },
    });

    const outcome = await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(outcome.adopted).toBe(true);
    expect(outcome.operation).toBe('edit');
    expect(calls[1]?.task).toBe('variation/edit_variation_submit');
    expect(updates[0]?.sixorbitId).toBe('160595');
  });

  it('saves their isvid as soon as the search finds it, before the edit is attempted', async () => {
    // Their isvid is the primary key and this search is the only way to recover it. If a
    // rejected edit discarded it, the product would still look un-pushed and the next
    // attempt would have to search again — and the day that search misses, the link is
    // gone and a duplicate follows.
    const { prisma, updates } = stubPrisma(product());
    const { client } = stubClient({
      search: { variations: [{ isvid: '160595', variation_number: '17361' }] },
      write: { throw: new Error('SixOrbit said no') },
    });

    await expect(new SixOrbitProductPushService(prisma, client).push('p1')).rejects.toThrow(
      'SixOrbit said no',
    );

    expect(updates[0]?.sixorbitId).toBe('160595');
    expect(updates[0]?.sixorbitNumber).toBe('17361');
    // The failure is still recorded — the id survives, the outcome is not dressed up.
    expect(updates[1]?.sixorbitSyncStatus).toBe('FAILED');
  });

  it('ignores a search hit whose variation_number is only a partial match', async () => {
    // Their search is a contains match: "17361" also returns "173610".
    const { prisma } = stubPrisma(product());
    const { client, calls } = stubClient({
      search: { variations: [{ isvid: '160595', variation_number: '173610' }] },
      write: { isvid: '999' },
    });

    await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(calls[1]?.task).toBe('variation/create_variation_submit');
  });

  it('refuses to create when the duplicate check itself failed', async () => {
    // A failed lookup is not evidence of absence. Treating it as such is exactly how the
    // duplicate gets made.
    const { prisma } = stubPrisma(product());
    const { client, calls } = stubClient({ search: { fail: 'timeout' } });

    await expect(new SixOrbitProductPushService(prisma, client).push('p1')).rejects.toThrow(
      /Could not check SixOrbit/,
    );
    expect(calls.some((c) => c.task.includes('create'))).toBe(false);
  });
});

describe('SixOrbitProductPushService — blocked products', () => {
  it('blocks rather than fails when the brand exists only here', async () => {
    const { prisma, updates } = stubPrisma(product({ brand: { sixorbitId: null } }));
    const { client, calls } = stubClient({});

    const outcome = await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(outcome.operation).toBe('blocked');
    expect(updates[0]?.sixorbitSyncStatus).toBe('BLOCKED');
    // Nothing was sent: retrying against a wall helps nobody.
    expect(calls).toEqual([]);
  });

  it('explains what a human has to do, without naming the enum', async () => {
    const { prisma, updates } = stubPrisma(product({ category: { sixorbitId: null } }));
    const { client } = stubClient({});

    await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(String(updates[0]?.sixorbitSyncError)).toContain('category');
    expect(String(updates[0]?.sixorbitSyncError)).not.toContain('CATEGORY_NOT_IN_SIXORBIT');
  });
});

describe('SixOrbitProductPushService — results', () => {
  it('stores the new id so the next push edits rather than duplicates', async () => {
    const { prisma, updates } = stubPrisma(product());
    const { client } = stubClient({ write: { isvid: '160777' } });

    await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(updates[0]?.sixorbitId).toBe('160777');
    expect(updates[0]?.sixorbitSyncStatus).toBe('SYNCED');
  });

  it('fails loudly when they accept a create but return no id', async () => {
    // Silently succeeding here would mean the next push creates a second copy.
    const { prisma, updates } = stubPrisma(product());
    const { client } = stubClient({ write: {} });

    await expect(new SixOrbitProductPushService(prisma, client).push('p1')).rejects.toThrow(
      /returned no isvid/,
    );
    expect(updates[0]?.sixorbitSyncStatus).toBe('FAILED');
  });

  it('records the failure on the row and still rethrows for the queue', async () => {
    const { prisma, updates } = stubPrisma(product({ sixorbitId: '160595' }));
    const { client } = stubClient({ write: { throw: new Error('SixOrbit said no') } });

    await expect(new SixOrbitProductPushService(prisma, client).push('p1')).rejects.toThrow(
      'SixOrbit said no',
    );
    expect(updates[0]?.sixorbitSyncStatus).toBe('FAILED');
    expect(updates[0]?.sixorbitSyncError).toBe('SixOrbit said no');
  });

  it('does not treat a product deleted since queueing as an error', async () => {
    const { prisma } = stubPrisma(null);
    const { client, calls } = stubClient({});

    const outcome = await new SixOrbitProductPushService(prisma, client).push('gone');

    expect(outcome.operation).toBe('blocked');
    expect(calls).toEqual([]);
  });
});
