import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import {
  CommandHandler,
  EventsHandler,
  type ICommandHandler,
  type IEventHandler,
} from '@nestjs/cqrs';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@tiles-erp/config';
import { NotFoundError } from '@tiles-erp/shared';
import type { SixOrbitProductPushJobData, SixOrbitPushResult } from '@tiles-erp/shared-types';
import {
  SIXORBIT_CONFIG_REPOSITORY,
  SixOrbitProductPushService,
  type SixOrbitConfigRepository,
} from '@tiles-erp/sixorbit';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ProductChangedEvent } from '../../products/domain/product-changed.event';

export class PushProductToSixOrbitCommand {
  constructor(
    public readonly productId: string,
    public readonly actorId: string,
  ) {}
}

export class PushPendingProductsCommand {
  constructor(public readonly actorId: string) {}
}

/** How many rows one "push everything outstanding" enqueues. */
const BULK_PUSH_LIMIT = 500;

/**
 * Puts one product on the queue, once, and marks it pending.
 *
 * Shared by the automatic path and the manual button so both behave identically — the
 * only difference between them is what caused the enqueue.
 */
async function enqueue(
  prisma: PrismaService,
  queue: Queue<SixOrbitProductPushJobData>,
  productId: string,
  actorId: string | null,
): Promise<void> {
  await prisma.product.update({
    where: { id: productId },
    data: { sixorbitSyncStatus: 'PENDING', sixorbitSyncError: null },
  });
  const data: SixOrbitProductPushJobData = { kind: 'PRODUCT_PUSH', productId, actorId };
  const jobId = `product-push:${productId}`;

  // BullMQ treats a jobId as unique across jobs it has *retained*, not merely across jobs
  // in flight — and this queue keeps the last thousand completed and five thousand failed.
  // So reusing the id would silently drop every push after the first: `add` returns the
  // old job instead of queueing the new one, without an error, and the product sits at
  // PENDING for ever. Clearing the retained job first is what makes the id reusable.
  try {
    await queue.remove(jobId);
    await queue.add('product-push', data, { jobId });
  } catch {
    // The job could not be removed because it is running right now. Reusing the id would
    // be dropped again, so this one goes on unkeyed: a second push of the same product is
    // wasteful, but losing the edit that prompted it is worse.
    await queue.add('product-push', data);
  }
}

/**
 * Pushes a product whenever one changes here.
 *
 * Subscribed rather than called, so the products module never learns that SixOrbit
 * exists. Silent when the integration is switched off: an installation not using
 * SixOrbit must not accumulate a queue of work nobody will ever run.
 */
@EventsHandler(ProductChangedEvent)
export class PushProductOnChangeHandler implements IEventHandler<ProductChangedEvent> {
  private readonly logger = new Logger(PushProductOnChangeHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SIXORBIT) private readonly queue: Queue<SixOrbitProductPushJobData>,
    @Inject(SIXORBIT_CONFIG_REPOSITORY) private readonly configRepo: SixOrbitConfigRepository,
  ) {}

  async handle(event: ProductChangedEvent): Promise<void> {
    try {
      const credentials = await this.configRepo.findActiveCredentials();
      if (!credentials) return;
      await enqueue(this.prisma, this.queue, event.productId, event.actorId);
    } catch (error) {
      // An event handler that throws would surface as a failed product save, which is a
      // lie: the product saved. The sync is what did not start.
      this.logger.error(
        `Could not queue product ${event.productId} for SixOrbit: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * The manual push, executed inline.
 *
 * Deliberately not queued. One product is a single call to SixOrbit — half a second — and
 * the person who pressed the button is watching. Queueing it buys nothing and costs the
 * only thing that matters here: knowing whether it worked. Pressing a button and being
 * told "queued" while the row sits at PENDING is not an answer.
 *
 * The automatic path stays on the queue, where a catalogue's worth of edits belongs.
 */
@CommandHandler(PushProductToSixOrbitCommand)
export class PushProductToSixOrbitHandler implements ICommandHandler<
  PushProductToSixOrbitCommand,
  SixOrbitPushResult
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pusher: SixOrbitProductPushService,
  ) {}

  async execute(command: PushProductToSixOrbitCommand): Promise<SixOrbitPushResult> {
    const product = await this.prisma.product.findFirst({
      where: { id: command.productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundError('Product not found');
    return this.pusher.push(product.id, null);
  }
}

/**
 * Queues everything that has never reached SixOrbit, or failed on the way.
 *
 * BLOCKED rows are deliberately included: a brand added on their side since the last
 * attempt is exactly what unblocks one, and re-checking is cheap. Bounded, because
 * enqueuing seven thousand jobs from a button press is not a considered act.
 */
@CommandHandler(PushPendingProductsCommand)
export class PushPendingProductsHandler implements ICommandHandler<
  PushPendingProductsCommand,
  { queued: number }
> {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SIXORBIT) private readonly queue: Queue<SixOrbitProductPushJobData>,
  ) {}

  async execute(command: PushPendingProductsCommand): Promise<{ queued: number }> {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        sixorbitSyncStatus: { in: ['NOT_SYNCED', 'FAILED', 'BLOCKED'] },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: BULK_PUSH_LIMIT,
    });

    for (const product of products) {
      await enqueue(this.prisma, this.queue, product.id, command.actorId);
    }
    return { queued: products.length };
  }
}
