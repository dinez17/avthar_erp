import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@tiles-erp/config';
import type { SixOrbitJobData } from '@tiles-erp/shared-types';
import {
  SixOrbitImportStatusStore,
  SixOrbitProductImportService,
  SixOrbitProductPushService,
} from '@tiles-erp/sixorbit';

/**
 * Runs SixOrbit work off the queue.
 *
 * The catalogue pull is eighteen megabytes of JSON and several thousand upserts, which is
 * exactly the sort of thing that should not happen inside an HTTP request. It lives here,
 * and the page that started it watches through the status store.
 *
 * Concurrency is left at BullMQ's default of one for this queue: two imports at once
 * would race to write the same products.
 */
@Processor(QUEUE_NAMES.SIXORBIT)
export class SixOrbitProcessor extends WorkerHost {
  private readonly logger = new Logger(SixOrbitProcessor.name);

  constructor(
    private readonly importer: SixOrbitProductImportService,
    private readonly pusher: SixOrbitProductPushService,
    private readonly status: SixOrbitImportStatusStore,
  ) {
    super();
  }

  async process(job: Job<SixOrbitJobData>): Promise<void> {
    switch (job.data.kind) {
      case 'PRODUCT_IMPORT':
        return this.runImport(job as Job<Extract<SixOrbitJobData, { kind: 'PRODUCT_IMPORT' }>>);
      case 'PRODUCT_PUSH':
        return this.runPush(job as Job<Extract<SixOrbitJobData, { kind: 'PRODUCT_PUSH' }>>);
      default:
        // Forward compatibility: a job kind this build does not know about is logged and
        // dropped rather than retried against a handler that will never exist.
        this.logger.warn(`Ignoring unknown SixOrbit job kind: ${String(job.data)}`);
        return;
    }
  }

  /**
   * One product on its way out.
   *
   * A blocked product is not an error: the push service has already written the reason on
   * the row, and throwing would have the queue retry something only a human can fix.
   */
  private async runPush(
    job: Job<Extract<SixOrbitJobData, { kind: 'PRODUCT_PUSH' }>>,
  ): Promise<void> {
    const outcome = await this.pusher.push(job.data.productId, job.id ?? null);
    if (outcome.operation === 'blocked') {
      this.logger.warn(
        `SixOrbit push blocked for product ${job.data.productId}: ${outcome.reason}`,
      );
      return;
    }
    this.logger.log(
      `SixOrbit push ${outcome.operation}${outcome.adopted ? ' (adopted existing)' : ''}: product ${job.data.productId} is ${outcome.sixorbitId}`,
    );
  }

  private async runImport(
    job: Job<Extract<SixOrbitJobData, { kind: 'PRODUCT_IMPORT' }>>,
  ): Promise<void> {
    const since = job.data.since ? new Date(job.data.since) : null;
    this.logger.log(
      since
        ? `SixOrbit product import: changes since ${since.toISOString()}`
        : 'SixOrbit product import: full catalogue',
    );

    try {
      const result = await this.importer.run({
        dryRun: false,
        since,
        actorId: job.data.actorId,
        jobId: job.id ?? null,
        onProgress: (processed, total) => this.status.progress(processed, total),
      });

      await this.status.finish(result);
      this.logger.log(
        `SixOrbit product import finished: ${result.productsCreated} created, ${result.productsUpdated} updated, ${result.flagged} flagged, ${result.skipped.length} skipped in ${result.durationMs}ms`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Recorded on the status before rethrowing, so the page shows why it stopped rather
      // than sitting on "running" until the record expires. Rethrowing still lets BullMQ
      // apply its retry policy.
      await this.status.fail(message);
      this.logger.error(`SixOrbit product import failed: ${message}`);
      throw error;
    }
  }
}
