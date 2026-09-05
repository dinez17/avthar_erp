import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import type {
  Paginated,
  SaveSixOrbitConfigInput,
  SixOrbitConfigItem,
  SixOrbitConnectionTest,
  SixOrbitPruneResult,
  SixOrbitSyncHealth,
  SixOrbitSyncLogItem,
  SixOrbitSyncLogQuery,
  UUID,
} from '@tiles-erp/shared-types';
import {
  SIXORBIT_CONFIG_REPOSITORY,
  SIXORBIT_SYNC_LOG_REPOSITORY,
  SixOrbitApiError,
  SixOrbitAuthService,
  SixOrbitNotConfiguredError,
  type SixOrbitConfigRepository,
  type SixOrbitSyncLogRepository,
} from '@tiles-erp/sixorbit';

/** Their server has no published timeout; 30s is a starting point, tunable per install. */
const DEFAULT_TIMEOUT_MS = 30_000;

export class GetSixOrbitConfigQuery {}

export class SaveSixOrbitConfigCommand {
  constructor(
    public readonly input: SaveSixOrbitConfigInput,
    public readonly actorId: UUID,
  ) {}
}

export class TestSixOrbitConnectionCommand {}

export class ListSixOrbitSyncLogQuery {
  constructor(public readonly query: SixOrbitSyncLogQuery) {}
}

export class GetSixOrbitSyncHealthQuery {
  constructor(public readonly windowHours: number) {}
}

export class PruneSixOrbitSyncLogCommand {
  constructor(public readonly olderThanDays: number) {}
}

@QueryHandler(GetSixOrbitConfigQuery)
export class GetSixOrbitConfigHandler implements IQueryHandler<
  GetSixOrbitConfigQuery,
  SixOrbitConfigItem | null
> {
  constructor(
    @Inject(SIXORBIT_CONFIG_REPOSITORY) private readonly configRepo: SixOrbitConfigRepository,
  ) {}

  execute(): Promise<SixOrbitConfigItem | null> {
    return this.configRepo.findCurrent();
  }
}

@CommandHandler(SaveSixOrbitConfigCommand)
export class SaveSixOrbitConfigHandler implements ICommandHandler<
  SaveSixOrbitConfigCommand,
  SixOrbitConfigItem
> {
  constructor(
    @Inject(SIXORBIT_CONFIG_REPOSITORY) private readonly configRepo: SixOrbitConfigRepository,
  ) {}

  execute(command: SaveSixOrbitConfigCommand): Promise<SixOrbitConfigItem> {
    const { input } = command;
    return this.configRepo.save(
      {
        baseUrl: input.baseUrl.trim(),
        apiKey: (input.apiKey ?? '123').trim(),
        email: input.email.trim(),
        // Undefined leaves the stored password alone. An empty string means the field was
        // rendered blank and left blank, which is not a request to erase the password.
        password: input.password ? input.password : undefined,
        requestTimeoutMs: input.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
        isActive: input.isActive ?? true,
        notes: input.notes ?? null,
        version: input.version,
      },
      command.actorId,
    );
  }
}

/**
 * Logs in with the stored credentials and reports what came back.
 *
 * Deliberately a fresh login rather than a cached session: someone pressing this has just
 * changed something and wants to know whether *that* works, not whether a token obtained
 * an hour ago still does.
 *
 * It never throws for a rejected login. A wrong password is an ordinary answer to this
 * question, and the screen should show it as a red panel rather than an error page.
 */
@CommandHandler(TestSixOrbitConnectionCommand)
export class TestSixOrbitConnectionHandler implements ICommandHandler<
  TestSixOrbitConnectionCommand,
  SixOrbitConnectionTest
> {
  constructor(private readonly auth: SixOrbitAuthService) {}

  async execute(): Promise<SixOrbitConnectionTest> {
    const startedAt = Date.now();
    try {
      const credentials = await this.auth.requireCredentials();
      const data = await this.auth.login(credentials);
      return {
        success: true,
        message: 'Connected to SixOrbit.',
        userName: data.user_name,
        companyCode: data.company_code,
        companyName: data.company_name,
        outletName: data.user_outlet?.name,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message =
        error instanceof SixOrbitApiError || error instanceof SixOrbitNotConfiguredError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not connect to SixOrbit.';
      return { success: false, message, durationMs: Date.now() - startedAt };
    }
  }
}

@QueryHandler(ListSixOrbitSyncLogQuery)
export class ListSixOrbitSyncLogHandler implements IQueryHandler<
  ListSixOrbitSyncLogQuery,
  Paginated<SixOrbitSyncLogItem>
> {
  constructor(
    @Inject(SIXORBIT_SYNC_LOG_REPOSITORY) private readonly syncLog: SixOrbitSyncLogRepository,
  ) {}

  execute(query: ListSixOrbitSyncLogQuery): Promise<Paginated<SixOrbitSyncLogItem>> {
    return this.syncLog.list(query.query);
  }
}

@QueryHandler(GetSixOrbitSyncHealthQuery)
export class GetSixOrbitSyncHealthHandler implements IQueryHandler<
  GetSixOrbitSyncHealthQuery,
  SixOrbitSyncHealth
> {
  constructor(
    @Inject(SIXORBIT_SYNC_LOG_REPOSITORY) private readonly syncLog: SixOrbitSyncLogRepository,
  ) {}

  execute(query: GetSixOrbitSyncHealthQuery): Promise<SixOrbitSyncHealth> {
    return this.syncLog.health(query.windowHours);
  }
}

@CommandHandler(PruneSixOrbitSyncLogCommand)
export class PruneSixOrbitSyncLogHandler implements ICommandHandler<
  PruneSixOrbitSyncLogCommand,
  SixOrbitPruneResult
> {
  constructor(
    @Inject(SIXORBIT_SYNC_LOG_REPOSITORY) private readonly syncLog: SixOrbitSyncLogRepository,
  ) {}

  async execute(command: PruneSixOrbitSyncLogCommand): Promise<SixOrbitPruneResult> {
    return {
      deleted: await this.syncLog.prune(command.olderThanDays),
      olderThanDays: command.olderThanDays,
    };
  }
}
