import type { PrismaClient } from '@prisma/client';
import { SIXORBIT_TASKS } from '../domain/sixorbit-task';
import {
  buildSixOrbitPushPlan,
  SIXORBIT_PUSH_BLOCK_REASONS,
  type SixOrbitPushInput,
} from '../domain/sixorbit-push';
import type { SixOrbitVariation, SixOrbitVariationPage } from '../domain/sixorbit-variation';
import { silentSixOrbitLogger, type SixOrbitLogger } from '../domain/sixorbit-ports';
import { SixOrbitApiError } from '../domain/sixorbit.errors';
import type { SixOrbitClient } from './sixorbit.client';

export interface SixOrbitPushOutcome {
  productId: string;
  /** What actually happened, which is not always what was planned — see `adopted`. */
  operation: 'create' | 'edit' | 'blocked';
  sixorbitId: string | null;
  /** True when a create found the product already there and switched to editing it. */
  adopted: boolean;
  reason: string | null;
}

/** What `variation/create_variation_submit` gives back. */
interface CreateVariationResponse {
  isvid?: string;
  variations?: { isvid?: string }[];
}

/**
 * Writes one of our products into SixOrbit.
 *
 * **On duplicates.** No task in their API accepts an external reference, so a create that
 * times out after they committed it leaves us with no id and them with a product. The
 * retry would make a second one. Every create therefore searches for the sku first and
 * adopts an exact match instead — which costs one extra request and removes the only
 * unrecoverable failure in this integration.
 *
 * **On blocked products.** Their API can create neither a brand nor a category. A product
 * under a master they do not have is marked BLOCKED with a reason a human can act on,
 * rather than retried against a wall until the queue gives up.
 */
export class SixOrbitProductPushService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly client: SixOrbitClient,
    private readonly logger: SixOrbitLogger = silentSixOrbitLogger,
  ) {}

  async push(productId: string, jobId: string | null = null): Promise<SixOrbitPushOutcome> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        brand: { select: { sixorbitId: true } },
        category: { select: { sixorbitId: true } },
        sixorbitAttributes: true,
      },
    });

    if (!product || product.deletedAt) {
      // Deleted between being queued and being run. Not an error worth retrying.
      return {
        productId,
        operation: 'blocked',
        sixorbitId: null,
        adopted: false,
        reason: 'The product no longer exists.',
      };
    }

    const input: SixOrbitPushInput = {
      sixorbitId: product.sixorbitId,
      name: product.name,
      sku: product.sku,
      hsnCode: product.hsnCode,
      gstRate: Number(product.gstRate),
      sellingRate: product.sellingRate === null ? null : Number(product.sellingRate),
      purchaseRate: product.purchaseRate === null ? null : Number(product.purchaseRate),
      mrp: product.mrp === null ? null : Number(product.mrp),
      piecesPerBox: product.piecesPerBox,
      sqftPerBox: Number(product.sqftPerBox),
      barcode: product.barcode,
      isActive: product.isActive,
      brandSixorbitId: product.brand?.sixorbitId ?? null,
      categorySixorbitId: product.category?.sixorbitId ?? null,
      attributes: product.sixorbitAttributes.map((a) => ({
        aid: a.aid,
        attr_name: a.name,
        avid: a.avid,
        attr_value: a.value,
      })),
      raw: (product.sixorbitRaw as Record<string, unknown> | null) ?? null,
    };

    const plan = buildSixOrbitPushPlan(input);

    if (plan.blocks.length > 0) {
      const reason = plan.blocks.map((b) => SIXORBIT_PUSH_BLOCK_REASONS[b]).join(' ');
      await this.prisma.product.update({
        where: { id: productId },
        data: { sixorbitSyncStatus: 'BLOCKED', sixorbitSyncError: reason },
      });
      return { productId, operation: 'blocked', sixorbitId: null, adopted: false, reason };
    }

    let operation = plan.operation;
    let payload = plan.payload;
    let adopted = false;

    if (operation === 'create') {
      const existing = await this.findBySku(product.sku, productId, jobId);
      if (existing?.isvid) {
        // They already have it. Editing what is there beats creating a second one.
        this.logger.warn?.(
          `SixOrbit already has variation_number ${product.sku} as ${existing.isvid}; editing instead of creating.`,
        );
        operation = 'edit';
        adopted = true;
        payload = buildSixOrbitPushPlan({
          ...input,
          sixorbitId: existing.isvid,
          raw: existing as unknown as Record<string, unknown>,
        }).payload;

        // Their isvid is written down the moment we learn it, before the edit is attempted
        // rather than after it succeeds.
        //
        // It is their primary key, and this search is the only way to recover it once a
        // product exists on both sides unlinked. Saving it only on success meant a rejected
        // edit discarded it and left the product looking un-pushed — so the next attempt
        // searched again, and if *that* search ever failed or their `variation_number`
        // stopped matching, the link would be lost for good and a duplicate would follow.
        // The id is a fact about their catalogue; whether our edit was accepted is not.
        await this.prisma.product.update({
          where: { id: productId },
          data: { sixorbitId: existing.isvid, sixorbitNumber: product.sku },
        });
      }
    }

    try {
      const sixorbitId = await this.send(operation, payload, product, jobId);
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          sixorbitId,
          sixorbitNumber: product.sku,
          sixorbitSyncStatus: 'SYNCED',
          sixorbitSyncedAt: new Date(),
          sixorbitSyncError: null,
        },
      });
      return { productId, operation, sixorbitId, adopted, reason: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.product.update({
        where: { id: productId },
        data: { sixorbitSyncStatus: 'FAILED', sixorbitSyncError: message },
      });
      // Rethrown so the queue can apply its retry policy to a transport failure. The row
      // already says what went wrong either way.
      throw error;
    }
  }

  private async send(
    operation: 'create' | 'edit',
    payload: Record<string, unknown>,
    product: { id: string; sku: string; sixorbitId: string | null },
    jobId: string | null,
  ): Promise<string> {
    const spec =
      operation === 'create' ? SIXORBIT_TASKS.CREATE_VARIATION : SIXORBIT_TASKS.EDIT_VARIATION;

    const data = await this.client.callOrThrow<CreateVariationResponse>({
      spec,
      data: payload,
      log: {
        entityType: 'PRODUCT',
        entityId: product.id,
        externalId: product.sixorbitId ?? null,
        direction: 'PUSH',
        jobId,
      },
    });

    if (operation === 'edit') {
      // An edit keeps the id it was given; their response does not repeat it.
      return (payload.isvid as string) ?? product.sixorbitId ?? '';
    }

    const created = data?.isvid ?? data?.variations?.[0]?.isvid;
    if (!created) {
      // They accepted it but told us nothing. Failing here is right: without the id the
      // next push would create a second copy.
      throw new SixOrbitApiError(
        `SixOrbit accepted the new variation for ${product.sku} but returned no isvid, so it cannot be linked. Re-run the product import to pick it up.`,
        'UNKNOWN',
      );
    }
    return created;
  }

  /** Their search is a contains match, so the exact variation_number is confirmed here. */
  private async findBySku(
    sku: string,
    productId: string,
    jobId: string | null,
  ): Promise<SixOrbitVariation | null> {
    const outcome = await this.client.call<SixOrbitVariationPage>({
      spec: SIXORBIT_TASKS.FETCH_VARIATION,
      params: { searchtext: sku, limit: 50, limit_bit: 0 },
      log: { entityType: 'PRODUCT', entityId: productId, direction: 'PULL', jobId },
    });

    if (!outcome.ok) {
      // A failed lookup must not be read as "no duplicate exists" — that is exactly how
      // the duplicate gets made. Fail the push instead and let it be retried.
      throw new SixOrbitApiError(
        `Could not check SixOrbit for an existing ${sku} before creating it: ${outcome.message}`,
        outcome.kind,
        outcome.resultCode,
      );
    }

    return (outcome.data.variations ?? []).find((v) => v.variation_number === sku) ?? null;
  }
}
