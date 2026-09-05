import type { PrismaClient } from '@prisma/client';
import type { SixOrbitVariation } from '../domain/sixorbit-variation';
import type { SixOrbitClient } from './sixorbit.client';
import { SixOrbitProductImportService } from './sixorbit-product-import.service';

/**
 * A Prisma stand-in that records every write it is asked to make.
 *
 * The point of these tests is what the importer *does to the database*, so the assertions
 * are about which calls happened rather than what came back. An empty catalogue on our
 * side is the interesting starting state: it is what the first real run meets.
 */
function stubPrisma(): { prisma: PrismaClient; writes: string[] } {
  const writes: string[] = [];
  const noRows = { findMany: () => Promise.resolve([]) };

  const prisma = {
    brand: {
      ...noRows,
      create: ({ data }: { data: { name: string } }) => {
        writes.push(`brand.create:${data.name}`);
        return Promise.resolve({ id: `brand-${data.name}` });
      },
      update: () => {
        writes.push('brand.update');
        return Promise.resolve({});
      },
    },
    category: {
      ...noRows,
      create: ({ data }: { data: { name: string } }) => {
        writes.push(`category.create:${data.name}`);
        return Promise.resolve({ id: `category-${data.name}` });
      },
      update: () => {
        writes.push('category.update');
        return Promise.resolve({});
      },
    },
    product: {
      ...noRows,
      create: () => {
        writes.push('product.create');
        return Promise.resolve({ id: 'product-1' });
      },
      update: () => {
        writes.push('product.update');
        return Promise.resolve({});
      },
      deleteMany: () => Promise.resolve({ count: 0 }),
    },
    sixOrbitProductAttribute: {
      deleteMany: () => ({ __op: 'attr.deleteMany' }),
      createMany: () => ({ __op: 'attr.createMany' }),
    },
    $transaction: (ops: unknown[]) => {
      writes.push(`transaction:${ops.length}`);
      return Promise.resolve([]);
    },
  } as unknown as PrismaClient;

  return { prisma, writes };
}

const variation = (over: Partial<SixOrbitVariation> = {}): SixOrbitVariation =>
  ({
    isvid: '160595',
    variation_number: '17361',
    variation_name: 'AV ROVEN GREY E 4X2 (3) (GLITTER)',
    brand_id: '410012486',
    brand: 'UDAY (AVTHAR)',
    category_id: '410053695',
    category: 'TILES',
    hsn_code: '69072100',
    tax: '18.00000000',
    price: '635.59000000',
    package_quantity: '3',
    measured_qty: '8.0000',
    measured_unit: 'SQFT',
    status_id: '1',
    ...over,
  }) as SixOrbitVariation;

function stubClient(variations: SixOrbitVariation[]): SixOrbitClient {
  return {
    callOrThrow: () => Promise.resolve({ variations }),
  } as unknown as SixOrbitClient;
}

describe('SixOrbitProductImportService — dry run', () => {
  it('reports the products it would create, not a catalogue of skips', async () => {
    // The bug this pins down: masters are not created during a dry run, so if their ids
    // are left unresolved every product beneath them is reported as "brand could not be
    // matched or created". A first dry run against a fresh catalogue then reads
    // "7682 skipped, 0 created" — the exact opposite of what the real run does.
    const { prisma, writes } = stubPrisma();
    const service = new SixOrbitProductImportService(
      prisma,
      stubClient([variation(), variation({ isvid: '160596', variation_number: '17362' })]),
    );

    const result = await service.run({ dryRun: true });

    expect(result.productsCreated).toBe(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.brandsCreated).toBe(1);
    expect(result.categoriesCreated).toBe(1);
    expect(writes).toEqual([]);
  });

  it('writes absolutely nothing', async () => {
    const { prisma, writes } = stubPrisma();
    const service = new SixOrbitProductImportService(prisma, stubClient([variation()]));

    await service.run({ dryRun: true });

    expect(writes).toEqual([]);
  });

  it('still skips a product their side gave no brand for', async () => {
    // "0" is their sentinel for an absent relation. There is no name to create from, so
    // the row is named in the report rather than hung off an invented master.
    const { prisma } = stubPrisma();
    const service = new SixOrbitProductImportService(
      prisma,
      stubClient([variation({ brand_id: '0', brand: '' })]),
    );

    const result = await service.run({ dryRun: true });

    expect(result.productsCreated).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('brand');
  });
});

describe('SixOrbitProductImportService — real run', () => {
  it('creates the masters and then the products under them', async () => {
    const { prisma, writes } = stubPrisma();
    const service = new SixOrbitProductImportService(prisma, stubClient([variation()]));

    const result = await service.run({ dryRun: false });

    expect(result.productsCreated).toBe(1);
    expect(writes).toContain('brand.create:UDAY (AVTHAR)');
    expect(writes).toContain('category.create:TILES');
    expect(writes).toContain('product.create');
  });

  it('agrees with the dry run about what it is going to do', async () => {
    // The guarantee that makes a dry run worth running at all.
    const rows = [variation(), variation({ isvid: '160596', variation_number: '17362' })];

    const dry = await new SixOrbitProductImportService(
      stubPrisma().prisma,
      stubClient(rows),
    ).run({ dryRun: true });

    const real = await new SixOrbitProductImportService(
      stubPrisma().prisma,
      stubClient(rows),
    ).run({ dryRun: false });

    expect(dry.productsCreated).toBe(real.productsCreated);
    expect(dry.brandsCreated).toBe(real.brandsCreated);
    expect(dry.categoriesCreated).toBe(real.categoriesCreated);
    expect(dry.skipped.length).toBe(real.skipped.length);
  });
});
