import type { PrismaClient, Prisma } from '@prisma/client';
import type { SixOrbitImportResult } from '@tiles-erp/shared-types';
import { SIXORBIT_TASKS } from '../domain/sixorbit-task';
import {
  mapSixOrbitVariation,
  totalFromVariationPage,
  type MappedSixOrbitProduct,
  type SixOrbitVariationPage,
} from '../domain/sixorbit-variation';
import { silentSixOrbitLogger, type SixOrbitLogger } from '../domain/sixorbit-ports';
import type { SixOrbitClient } from './sixorbit.client';

export interface SixOrbitImportOptions {
  /** Work out what would change and write nothing. */
  dryRun: boolean;
  /** Only rows they have touched since this moment. Omit for the whole catalogue. */
  since?: Date | null;
  actorId?: string | null;
  jobId?: string | null;
  /** Called as rows are processed, so a long run can show progress. */
  onProgress?: (processed: number, total: number) => void | Promise<void>;
}

/**
 * How many products are written per transaction.
 *
 * One transaction around seven thousand upserts would hold locks on the products table
 * for the length of the whole import. Chunking means a failure loses one chunk rather
 * than the run, and the table stays usable while it happens.
 */
const CHUNK = 200;

/**
 * Stands in for a master a dry run would create.
 *
 * Deliberately not a UUID. Nothing writes during a dry run, but if this ever did reach a
 * write Postgres would reject the foreign key outright rather than quietly attaching
 * products to a brand that does not exist.
 */
const DRY_RUN_ID_PREFIX = 'dry-run:';

/** Their timestamp format — "2026-08-20 15:33:51", not ISO. */
const toSixOrbitTimestamp = (date: Date): string =>
  date.toISOString().slice(0, 19).replace('T', ' ');

/**
 * Imports SixOrbit's catalogue into TilesERP.
 *
 * **On paging.** Their `variation/fetch` accepts `limit` and `limit_bit`, but neither is
 * documented and the saved request sends both empty. Guessing wrong would not fail
 * loudly — it would import a subset and look like it worked, which is the worst outcome
 * available. So a full load asks for everything in one call (about 18 MB and six seconds
 * for ~7,700 tiles, which Node handles comfortably in the worker) and every run after
 * that uses `last_updated`, which returns almost nothing. If SixOrbit confirms the paging
 * semantics, this becomes a loop and nothing else changes.
 *
 * Masters are taken from the variations themselves rather than from `fetch_brand` and
 * `fetch_category`: every row already carries `brand_id` and `category_id`, so the
 * mapping comes free and cannot drift out of step with the products that depend on it.
 */
export class SixOrbitProductImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly client: SixOrbitClient,
    private readonly logger: SixOrbitLogger = silentSixOrbitLogger,
  ) {}

  async run(options: SixOrbitImportOptions): Promise<SixOrbitImportResult> {
    const startedAt = Date.now();

    const page = await this.client.callOrThrow<SixOrbitVariationPage>({
      spec: SIXORBIT_TASKS.FETCH_VARIATION,
      params: {
        // Empty parameters are dropped by the URL builder, so an absent `since` simply
        // means "everything" without sending a valueless key their server would strip.
        last_updated: options.since ? toSixOrbitTimestamp(options.since) : undefined,
        limit_bit: 0,
      },
      log: {
        entityType: 'PRODUCT',
        direction: 'PULL',
        jobId: options.jobId ?? null,
      },
    });

    const variations = page.variations ?? [];
    const mapped = variations.map(mapSixOrbitVariation);

    const result: SixOrbitImportResult = {
      dryRun: options.dryRun,
      fetched: mapped.length,
      total: totalFromVariationPage(page),
      productsCreated: 0,
      productsUpdated: 0,
      brandsCreated: 0,
      categoriesCreated: 0,
      flagged: 0,
      warningCounts: {},
      skipped: [],
      durationMs: 0,
    };

    for (const item of mapped) {
      if (item.warnings.length > 0) result.flagged += 1;
      for (const warning of item.warnings) {
        result.warningCounts[warning] = (result.warningCounts[warning] ?? 0) + 1;
      }
    }

    const brandIds = await this.resolveMasters('brand', mapped, options.dryRun, result);
    const categoryIds = await this.resolveMasters('category', mapped, options.dryRun, result);

    for (let offset = 0; offset < mapped.length; offset += CHUNK) {
      const chunk = mapped.slice(offset, offset + CHUNK);
      await this.applyChunk(chunk, brandIds, categoryIds, options, result);
      await options.onProgress?.(Math.min(offset + CHUNK, mapped.length), mapped.length);
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  }

  /**
   * Maps their brands or categories onto ours, creating what is missing.
   *
   * Matching is by their id first and by name second. The name step is what lets an
   * existing TilesERP brand adopt its SixOrbit identity instead of being duplicated
   * beside an identical one — which is the difference between an import that tidies the
   * catalogue and one that doubles it.
   */
  private async resolveMasters(
    kind: 'brand' | 'category',
    mapped: MappedSixOrbitProduct[],
    dryRun: boolean,
    result: SixOrbitImportResult,
  ): Promise<Map<string, string>> {
    const wanted = new Map<string, string>();
    for (const item of mapped) {
      const master = kind === 'brand' ? item.brand : item.category;
      if (master) wanted.set(master.sixorbitId, master.name);
    }
    if (wanted.size === 0) return new Map();

    // Brand and Category are separate Prisma delegates with incompatible signatures, so
    // the three operations are named explicitly rather than the delegates being unioned.
    const where = {
      OR: [{ sixorbitId: { in: [...wanted.keys()] } }, { name: { in: [...wanted.values()] } }],
    };
    const select = { id: true, name: true, sixorbitId: true } as const;
    const ops =
      kind === 'brand'
        ? {
            findMany: () => this.prisma.brand.findMany({ where, select }),
            stamp: (id: string, sixorbitId: string) =>
              this.prisma.brand.update({ where: { id }, data: { sixorbitId } }),
            create: (name: string, sixorbitId: string) =>
              this.prisma.brand.create({ data: { name, sixorbitId }, select: { id: true } }),
          }
        : {
            findMany: () => this.prisma.category.findMany({ where, select }),
            stamp: (id: string, sixorbitId: string) =>
              this.prisma.category.update({ where: { id }, data: { sixorbitId } }),
            create: (name: string, sixorbitId: string) =>
              this.prisma.category.create({ data: { name, sixorbitId }, select: { id: true } }),
          };

    const existing = await ops.findMany();
    const byExternal = new Map(
      existing
        .filter((row): row is typeof row & { sixorbitId: string } => row.sixorbitId !== null)
        .map((row) => [row.sixorbitId, row.id]),
    );
    const byName = new Map(existing.map((row) => [row.name, row]));

    const resolved = new Map<string, string>();

    for (const [sixorbitId, name] of wanted) {
      const already = byExternal.get(sixorbitId);
      if (already) {
        resolved.set(sixorbitId, already);
        continue;
      }

      const sameName = byName.get(name);
      if (sameName) {
        // A local record with the same name and no SixOrbit id yet: adopt it. One that
        // already carries a *different* id is a real clash — two of their records share a
        // name — and is left alone, because repointing ours would move every product
        // hanging off it.
        if (!sameName.sixorbitId) {
          if (!dryRun) await ops.stamp(sameName.id, sixorbitId);
          resolved.set(sixorbitId, sameName.id);
        } else {
          this.logger.warn(
            `SixOrbit ${kind} "${name}" (${sixorbitId}) clashes with an existing ${kind} already mapped to ${sameName.sixorbitId}; its products will be skipped.`,
          );
        }
        continue;
      }

      if (kind === 'brand') result.brandsCreated += 1;
      else result.categoriesCreated += 1;

      if (dryRun) {
        // Resolve to a stand-in rather than leaving the master unresolved. Without this
        // every product under a brand that does not exist yet is reported as skipped —
        // so the first dry run against a fresh catalogue says "7682 skipped, 0 created",
        // which is the opposite of what the real run would do and the opposite of what a
        // dry run is for.
        resolved.set(sixorbitId, `${DRY_RUN_ID_PREFIX}${kind}:${sixorbitId}`);
        continue;
      }

      const created = await ops.create(name, sixorbitId);
      resolved.set(sixorbitId, created.id);
    }

    return resolved;
  }

  private async applyChunk(
    chunk: MappedSixOrbitProduct[],
    brandIds: Map<string, string>,
    categoryIds: Map<string, string>,
    options: SixOrbitImportOptions,
    result: SixOrbitImportResult,
  ): Promise<void> {
    const existing = await this.prisma.product.findMany({
      where: {
        OR: [
          { sixorbitId: { in: chunk.map((item) => item.sixorbitId) } },
          { sku: { in: chunk.map((item) => item.sku) } },
        ],
      },
      select: { id: true, sku: true, sixorbitId: true },
    });
    const byExternal = new Map(
      existing.filter((row) => row.sixorbitId).map((row) => [row.sixorbitId as string, row]),
    );
    const bySku = new Map(existing.map((row) => [row.sku, row]));

    const writes: Prisma.PrismaPromise<unknown>[] = [];

    for (const item of chunk) {
      const brandId = item.brand ? brandIds.get(item.brand.sixorbitId) : undefined;
      const categoryId = item.category ? categoryIds.get(item.category.sixorbitId) : undefined;

      // A product must belong to a brand and a category in our schema. Rather than invent
      // an "Unknown" bucket that quietly accumulates, the row is skipped and named.
      if (!brandId || !categoryId) {
        result.skipped.push({
          sixorbitId: item.sixorbitId,
          name: item.name,
          reason: !brandId
            ? `brand "${item.brand?.name ?? 'none'}" could not be matched or created`
            : `category "${item.category?.name ?? 'none'}" could not be matched or created`,
        });
        continue;
      }

      const match = byExternal.get(item.sixorbitId);
      const skuOwner = bySku.get(item.sku);

      if (!match && skuOwner && skuOwner.sixorbitId && skuOwner.sixorbitId !== item.sixorbitId) {
        // Their variation_number is not guaranteed unique across variations, and our sku
        // is. Overwriting would silently merge two of their products into one of ours.
        result.skipped.push({
          sixorbitId: item.sixorbitId,
          name: item.name,
          reason: `SKU ${item.sku} already belongs to SixOrbit product ${skuOwner.sixorbitId}`,
        });
        continue;
      }

      const target = match ?? (skuOwner && !skuOwner.sixorbitId ? skuOwner : null);
      const data = this.toProductData(item, brandId, categoryId, options.actorId ?? null);

      if (target) {
        result.productsUpdated += 1;
        if (!options.dryRun) {
          writes.push(
            this.prisma.product.update({ where: { id: target.id }, data }),
            ...this.attributeWrites(target.id, item),
          );
        }
      } else {
        result.productsCreated += 1;
        if (!options.dryRun) {
          // Created one at a time rather than in the batch, because the attribute rows
          // need the new product's id and createMany does not return it.
          const created = await this.prisma.product.create({
            data: { ...data, createdBy: options.actorId ?? null },
            select: { id: true },
          });
          writes.push(...this.attributeWrites(created.id, item));
        }
      }
    }

    if (writes.length > 0) await this.prisma.$transaction(writes);
  }

  private toProductData(
    item: MappedSixOrbitProduct,
    brandId: string,
    categoryId: string,
    actorId: string | null,
  ): Prisma.ProductUncheckedUpdateInput & Prisma.ProductUncheckedCreateInput {
    return {
      sku: item.sku,
      name: item.name,
      categoryId,
      brandId,
      sizeMm: item.sizeMm,
      piecesPerBox: item.piecesPerBox,
      sqftPerBox: item.sqftPerBox,
      hsnCode: item.hsnCode,
      gstRate: item.gstRate,
      mrp: item.mrp,
      sellingRate: item.sellingRate,
      purchaseRate: item.purchaseRate,
      landingCost: item.landingCost,
      barcode: item.barcode,
      isActive: item.isActive,
      sixorbitId: item.sixorbitId,
      sixorbitNumber: item.sku,
      // A warning does not make the row unusable, but it must not read as clean either.
      sixorbitSyncStatus: item.warnings.length > 0 ? 'NEEDS_ATTENTION' : 'SYNCED',
      sixorbitSyncedAt: new Date(),
      sixorbitSyncError: null,
      sixorbitWarnings: item.warnings,
      sixorbitRaw: item.raw as unknown as Prisma.InputJsonValue,
      updatedBy: actorId,
    };
  }

  /** Their `aid`/`avid` pairs, kept verbatim because a later push has to send them back. */
  private attributeWrites(
    productId: string,
    item: MappedSixOrbitProduct,
  ): Prisma.PrismaPromise<unknown>[] {
    return item.attributes.map((attribute) =>
      this.prisma.sixOrbitProductAttribute.upsert({
        where: { productId_aid: { productId, aid: attribute.aid } },
        create: {
          productId,
          aid: attribute.aid,
          name: attribute.attr_name,
          avid: attribute.avid,
          value: attribute.attr_value,
        },
        update: {
          name: attribute.attr_name,
          avid: attribute.avid,
          value: attribute.attr_value,
        },
      }),
    );
  }
}
