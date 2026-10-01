import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '@tiles-erp/shared';
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

/** The generated number is in `obj`, not in `sku` (which echoes `sku_code`). */
interface CreateVariationResponse {
  isvid?: string | number;
  variation_number?: string | number;
  obj?: { isvid?: string | number; variation_number?: string | number }[];
  variations?: { isvid?: string | number; variation_number?: string | number }[];
}

const nonEmpty = (value: string | number | undefined | null): string | null => {
  if (value === undefined || value === null) return null;
  return String(value).trim() || null;
};

/**
 * Writes one of our products into SixOrbit.
 *
 * **On duplicates.** An add leaves `sku_code` empty so SixOrbit generates its own
 * `variation_number`. Before adding, an exact match on the old ERP SKU or a remote `sku`
 * is adopted when available. A timed-out add without a returned isvid cannot be found
 * reliably by the old SKU, so queued unlinked creates get one attempt only.
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

  async push(productId: string, jobId: string | null = null, branchId: string | null = null): Promise<SixOrbitPushOutcome> {
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

    // A create may have succeeded and saved its isvid while the follow-up number lookup
    // failed. Recover the generated number before an edit can submit the old ERP SKU.
    if (product.sixorbitId && !product.sixorbitNumber) {
      try {
        const recoveredSku = await this.fetchVariationNumber(product.sixorbitId, product.id, jobId);
        await this.prisma.product.update({
          where: { id: product.id },
          data: { sku: recoveredSku, sixorbitNumber: recoveredSku, version: { increment: 1 } },
        });
        product.sku = recoveredSku;
        product.sixorbitNumber = recoveredSku;
      } catch (error) {
        await this.prisma.product.update({
          where: { id: product.id },
          data: {
            sixorbitSyncStatus: 'FAILED',
            sixorbitSyncError: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    }

    const branchPrice = branchId
      ? await this.prisma.productBranchPrice.findUnique({
          where: { productId_branchId: { productId, branchId } },
          select: { franchiseeRate: true },
        })
      : null;
    if (branchId && !branchPrice) {
      throw new ValidationError('Set the franchisee rate for this product and branch in Selling Prices before syncing.');
    }

    const input: SixOrbitPushInput = {
      sixorbitId: product.sixorbitId,
      name: product.name,
      sku: product.sku,
      hsnCode: product.hsnCode,
      gstRate: Number(product.gstRate),
      sellingRate: product.sellingRate === null ? null : Number(product.sellingRate),
      purchaseRate: product.purchaseRate === null ? null : Number(product.purchaseRate),
      franchiseeRate: branchPrice ? Number(branchPrice.franchiseeRate) : null,
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
          `SixOrbit already has SKU ${product.sku} as ${existing.isvid}; editing instead of creating.`,
        );
        operation = 'edit';
        adopted = true;
        const adoptedSku = nonEmpty(existing.variation_number) ?? product.sku;
        payload = buildSixOrbitPushPlan({
          ...input,
          sku: adoptedSku,
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
          data: {
            ...(adoptedSku !== product.sku
              ? { sku: adoptedSku, version: { increment: 1 } }
              : {}),
            sixorbitId: existing.isvid,
            sixorbitNumber: adoptedSku,
          },
        });
        product.sku = adoptedSku;
      }
    }

    try {
      const sent = await this.send(operation, payload, product, jobId);
      let generatedSku: string | null = null;
      if (operation === 'create') {
        // The returned isvid identifies the remote row even if the number lookup or our
        // SKU update fails. Save it first so a retry cannot create a second variation.
        await this.prisma.product.update({
          where: { id: productId },
          data: { sixorbitId: sent.sixorbitId },
        });
        generatedSku =
          sent.variationNumber ??
          (await this.fetchVariationNumber(sent.sixorbitId, productId, jobId));
      }
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          ...(generatedSku ? { sku: generatedSku, version: { increment: 1 } } : {}),
          sixorbitId: sent.sixorbitId,
          sixorbitNumber: generatedSku ?? product.sku,
          sixorbitSyncStatus: 'SYNCED',
          sixorbitSyncedAt: new Date(),
          sixorbitSyncError: null,
        },
      });
      return { productId, operation, sixorbitId: sent.sixorbitId, adopted, reason: null };
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
  ): Promise<{ sixorbitId: string; variationNumber: string | null }> {
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
      return {
        sixorbitId: (payload.isvid as string) ?? product.sixorbitId ?? '',
        variationNumber: null,
      };
    }

    const row = data?.obj?.[0] ?? data?.variations?.[0];
    const created = nonEmpty(data?.isvid ?? row?.isvid);
    if (!created) {
      // They accepted it but told us nothing. Failing here is right: without the id the
      // next push would create a second copy.
      throw new SixOrbitApiError(
        `SixOrbit accepted the new variation for ${product.sku} but returned no isvid, so it cannot be linked. Re-run the product import to pick it up.`,
        'UNKNOWN',
      );
    }
    return {
      sixorbitId: created,
      variationNumber: nonEmpty(row?.variation_number ?? data?.variation_number),
    };
  }

  /** `variation/fetch&isvid=...` is the documented detail lookup for a generated code. */
  private async fetchVariationNumber(
    sixorbitId: string,
    productId: string,
    jobId: string | null,
  ): Promise<string> {
    const data = await this.client.callOrThrow<SixOrbitVariationPage & Partial<SixOrbitVariation>>({
      spec: SIXORBIT_TASKS.FETCH_VARIATION,
      params: { isvid: sixorbitId },
      log: {
        entityType: 'PRODUCT',
        entityId: productId,
        externalId: sixorbitId,
        direction: 'PULL',
        jobId,
      },
    });
    const variation = data.variations?.find((v) => v.isvid === sixorbitId) ??
      (data.isvid === sixorbitId ? data : null);
    const number = nonEmpty(variation?.variation_number);
    if (!number) {
      throw new SixOrbitApiError(
        `SixOrbit variation ${sixorbitId} returned no variation_number, so the ERP SKU cannot be updated.`,
        'UNKNOWN',
      );
    }
    return number;
  }

  /** Their search is a contains match, so the variation number or SKU is checked exactly. */
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
      // `variation/fetch` uses a failed envelope with 20004 for a normal empty search.
      // This is the specific absence result; other failures still stop the create.
      if (
        outcome.resultCode === '20004' &&
        /^No Variation found\.?$/i.test(outcome.message.trim())
      ) {
        return null;
      }
      // A failed lookup must not be read as "no duplicate exists" — that is exactly how
      // the duplicate gets made. Fail the push instead and let it be retried.
      throw new SixOrbitApiError(
        `Could not check SixOrbit for an existing ${sku} before creating it: ${outcome.message}`,
        outcome.kind,
        outcome.resultCode,
      );
    }

    return (outcome.data.variations ?? []).find(
      (v) => v.variation_number === sku || v.sku === sku,
    ) ?? null;
  }
}
