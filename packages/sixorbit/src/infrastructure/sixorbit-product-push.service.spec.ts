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
  sixorbitNumber: string | null;
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
  sixorbitNumber: '17361',
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
  search?:
    | { variations: { isvid: string; variation_number: string; sku?: string }[] }
    | { fail: string; resultCode?: string };
  write?: { isvid?: string | number; obj?: { variation_number: string }[] } | { throw: Error };
  detail?: { variations: { isvid: string; variation_number: string }[] } | { throw: Error };
}): { client: SixOrbitClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    call: (opts: { spec: { task: string }; params?: Record<string, unknown> }) => {
      calls.push({ task: opts.spec.task, params: opts.params });
      const s = script.search;
      if (s && 'fail' in s) {
        return Promise.resolve({
          ok: false,
          kind: 'TRANSPORT',
          resultCode: s.resultCode ?? null,
          message: s.fail,
        });
      }
      return Promise.resolve({
        ok: true,
        data: s ?? { variations: [] },
        resultCode: '20003',
        message: null,
      });
    },
    callOrThrow: (opts: { spec: { task: string }; data?: unknown; params?: Record<string, unknown> }) => {
      calls.push({ task: opts.spec.task, data: opts.data, params: opts.params });
      if (opts.spec.task === 'variation/fetch') {
        const detail = script.detail;
        if (detail && 'throw' in detail) return Promise.reject(detail.throw);
        return Promise.resolve(
          detail ?? { variations: [{ isvid: String(opts.params?.isvid), variation_number: '17493' }] },
        );
      }
      const w = script.write;
      if (w && 'throw' in w) return Promise.reject(w.throw);
      return Promise.resolve(w ?? {});
    },
  } as unknown as SixOrbitClient;
  return { client, calls };
}

describe('SixOrbitProductPushService — the duplicate guard', () => {
  it('searches for the sku before creating anything', async () => {
    // This still adopts an older unlinked variation whose number matches our local SKU.
    const { prisma } = stubPrisma(product());
    const { client, calls } = stubClient({ write: { isvid: '999' } });

    await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(calls[0]?.task).toBe('variation/fetch');
    expect(calls[0]?.params?.searchtext).toBe('17361');
    expect(calls[1]?.task).toBe('variation/create_variation_submit');
  });

  it('creates when variation/fetch returns its normal no-match result', async () => {
    const { prisma } = stubPrisma(product({ sku: 'TEST1' }));
    const { client, calls } = stubClient({
      search: { fail: 'No Variation found.', resultCode: '20004' },
      write: { isvid: 161089, obj: [{ variation_number: '17494' }] },
    });

    const outcome = await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(outcome.operation).toBe('create');
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

  it('adopts an exact remote SKU and replaces the ERP placeholder with variation_number', async () => {
    const { prisma, updates } = stubPrisma(product({ sku: 'TEST' }));
    const { client, calls } = stubClient({
      search: { variations: [{ isvid: '161088', variation_number: '17493', sku: 'TEST' }] },
    });

    const outcome = await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(outcome.adopted).toBe(true);
    expect(updates[0]?.sixorbitId).toBe('161088');
    expect(updates[0]?.sku).toBe('17493');
    expect((calls[1]?.data as Record<string, unknown>).sku_code).toBe('17493');
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
  it('uses the returned variation_number as ERP SKU and saves isvid first', async () => {
    const { prisma, updates } = stubPrisma(product());
    const { client, calls } = stubClient({
      write: { isvid: 161088, obj: [{ variation_number: '17493' }] },
    });

    await new SixOrbitProductPushService(prisma, client).push('p1');

    expect((calls[1]?.data as Record<string, unknown>).sku_code).toBe('');
    expect(updates[0]?.sixorbitId).toBe('161088');
    expect(updates[1]?.sku).toBe('17493');
    expect(updates[1]?.sixorbitNumber).toBe('17493');
    expect(updates[1]?.sixorbitSyncStatus).toBe('SYNCED');
    expect(calls).toHaveLength(2);
  });

  it('fetches the generated number by isvid when the add response omits it', async () => {
    const { prisma, updates } = stubPrisma(product());
    const { client, calls } = stubClient({ write: { isvid: '160777' } });

    await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(updates[0]?.sixorbitId).toBe('160777');
    expect(calls[2]?.params?.isvid).toBe('160777');
    expect(updates[1]?.sku).toBe('17493');
    expect(updates[1]?.sixorbitSyncStatus).toBe('SYNCED');
  });

  it('keeps the returned isvid if the generated number cannot be fetched', async () => {
    const { prisma, updates } = stubPrisma(product());
    const { client } = stubClient({
      write: { isvid: '160777' },
      detail: { throw: new Error('detail fetch failed') },
    });

    await expect(new SixOrbitProductPushService(prisma, client).push('p1')).rejects.toThrow(
      'detail fetch failed',
    );
    expect(updates[0]?.sixorbitId).toBe('160777');
    expect(updates[1]?.sixorbitSyncStatus).toBe('FAILED');
  });

  it('recovers a linked create number before an edit sends its SKU', async () => {
    const { prisma, updates } = stubPrisma(
      product({ sixorbitId: '160777', sixorbitNumber: null }),
    );
    const { client, calls } = stubClient({});

    await new SixOrbitProductPushService(prisma, client).push('p1');

    expect(calls[0]?.params?.isvid).toBe('160777');
    expect(updates[0]?.sku).toBe('17493');
    expect((calls[1]?.data as Record<string, unknown>).sku_code).toBe('17493');
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
