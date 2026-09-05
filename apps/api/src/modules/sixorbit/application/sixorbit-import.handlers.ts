import { InjectQueue } from '@nestjs/bullmq';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@tiles-erp/config';
import { ConflictError } from '@tiles-erp/shared';
import type {
  SixOrbitQueueSnapshot,
  SixOrbitImportJobData,
  SixOrbitImportResult,
  SixOrbitImportStatus,
  SixOrbitImportStatusView,
  StartSixOrbitImportInput,
} from '@tiles-erp/shared-types';
import { SixOrbitImportStatusStore, SixOrbitProductImportService } from '@tiles-erp/sixorbit';

export class DryRunSixOrbitImportQuery {
  constructor(public readonly since: string | null) {}
}

export class StartSixOrbitImportCommand {
  constructor(
    public readonly input: StartSixOrbitImportInput,
    public readonly actorId: string,
    public readonly actorName: string | null,
  ) {}
}

export class GetSixOrbitImportStatusQuery {}

export class ResetSixOrbitImportStatusCommand {}

/**
 * The dry run, executed inline.
 *
 * It is a read against SixOrbit and a set of reads against our own tables — six seconds
 * or so, and nothing is written. Putting it on the queue would mean the page had to poll
 * for an answer it could simply have waited for, so it does not.
 */
@QueryHandler(DryRunSixOrbitImportQuery)
export class DryRunSixOrbitImportHandler implements IQueryHandler<
  DryRunSixOrbitImportQuery,
  SixOrbitImportResult
> {
  constructor(private readonly importer: SixOrbitProductImportService) {}

  execute(query: DryRunSixOrbitImportQuery): Promise<SixOrbitImportResult> {
    return this.importer.run({
      dryRun: true,
      since: query.since ? new Date(query.since) : null,
    });
  }
}

/**
 * The real run, queued.
 *
 * Deliberately refuses to start a second one. Two catalogue imports at once would race
 * each other to write the same products, and the loser's work would be silently
 * overwritten rather than failing in a way anyone would notice.
 */
@CommandHandler(StartSixOrbitImportCommand)
export class StartSixOrbitImportHandler implements ICommandHandler<
  StartSixOrbitImportCommand,
  SixOrbitImportStatus
> {
  constructor(
    @InjectQueue(QUEUE_NAMES.SIXORBIT) private readonly queue: Queue<SixOrbitImportJobData>,
    private readonly status: SixOrbitImportStatusStore,
  ) {}

  async execute(command: StartSixOrbitImportCommand): Promise<SixOrbitImportStatus> {
    if (await this.status.isRunning()) {
      throw new ConflictError('A SixOrbit import is already running.');
    }

    const since = command.input.since ?? null;
    const started = await this.status.begin({ since, startedByName: command.actorName });

    await this.queue.add('product-import', {
      kind: 'PRODUCT_IMPORT',
      since,
      actorId: command.actorId,
    });

    return started;
  }
}

@QueryHandler(GetSixOrbitImportStatusQuery)
export class GetSixOrbitImportStatusHandler implements IQueryHandler<
  GetSixOrbitImportStatusQuery,
  SixOrbitImportStatusView
> {
  constructor(
    private readonly status: SixOrbitImportStatusStore,
    @InjectQueue(QUEUE_NAMES.SIXORBIT) private readonly queue: Queue<SixOrbitImportJobData>,
  ) {}

  async execute(): Promise<SixOrbitImportStatusView> {
    const status = await this.status.read();
    return { ...status, queue: await this.readQueue() };
  }

  /**
   * The queue's own counts.
   *
   * Never throws: a diagnostic that fails when things are broken is worse than useless,
   * and a null snapshot is itself informative — it means the API cannot reach Redis, so
   * neither can the worker.
   */
  private async readQueue(): Promise<SixOrbitQueueSnapshot | null> {
    try {
      const counts = await this.queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      const [lastFailed] = await this.queue.getFailed(0, 0);
      return {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        lastFailureReason: lastFailed?.failedReason ?? null,
      };
    } catch {
      return null;
    }
  }
}

@CommandHandler(ResetSixOrbitImportStatusCommand)
export class ResetSixOrbitImportStatusHandler implements ICommandHandler<
  ResetSixOrbitImportStatusCommand,
  void
> {
  constructor(private readonly status: SixOrbitImportStatusStore) {}

  async execute(): Promise<void> {
    // Only clears the progress record. A run that is genuinely still going in the worker
    // will carry on and report itself again; this is for clearing a stale banner, not for
    // cancelling work.
    await this.status.reset();
  }
}
