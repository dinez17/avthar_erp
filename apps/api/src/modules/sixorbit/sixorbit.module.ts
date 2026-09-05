import { Logger, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CqrsModule } from '@nestjs/cqrs';
import { QUEUE_NAMES } from '@tiles-erp/config';
import {
  PrismaSixOrbitConfigRepository,
  PrismaSixOrbitSyncLogRepository,
  SIXORBIT_CONFIG_REPOSITORY,
  SIXORBIT_SYNC_LOG_REPOSITORY,
  SixOrbitAuthService,
  SixOrbitClient,
  SixOrbitCryptoService,
  SixOrbitHttpService,
  SixOrbitImportStatusStore,
  SixOrbitProductImportService,
  SixOrbitProductPushService,
  type SixOrbitCache,
  type SixOrbitConfigRepository,
  type SixOrbitSyncLogRepository,
} from '@tiles-erp/sixorbit';
import { CONFIG_TOKEN, type AppConfig } from '../../core/config/configuration';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SixOrbitRedisCache } from './infrastructure/sixorbit-redis-cache.adapter';
import { SixOrbitController } from './presentation/sixorbit.controller';
import {
  DryRunSixOrbitImportHandler,
  GetSixOrbitImportStatusHandler,
  ResetSixOrbitImportStatusHandler,
  StartSixOrbitImportHandler,
} from './application/sixorbit-import.handlers';
import {
  GetSixOrbitConfigHandler,
  GetSixOrbitSyncHealthHandler,
  ListSixOrbitSyncLogHandler,
  PruneSixOrbitSyncLogHandler,
  SaveSixOrbitConfigHandler,
  TestSixOrbitConnectionHandler,
} from './application/sixorbit.handlers';
import {
  PushPendingProductsHandler,
  PushProductOnChangeHandler,
  PushProductToSixOrbitHandler,
} from './application/sixorbit-push.handlers';

/**
 * SixOrbit integration (phase 12).
 *
 * The client itself lives in `@tiles-erp/sixorbit` as plain classes, because the worker
 * consumes the same queue and cannot import from this application. What remains here is
 * Nest wiring and the two adapters the package asks for: Redis, and a logger.
 */
@Module({
  imports: [CqrsModule, BullModule.registerQueue({ name: QUEUE_NAMES.SIXORBIT })],
  controllers: [SixOrbitController],
  providers: [
    SixOrbitRedisCache,

    {
      provide: SixOrbitCryptoService,
      inject: [CONFIG_TOKEN],
      useFactory: (config: AppConfig): SixOrbitCryptoService =>
        new SixOrbitCryptoService(config.sixorbit.encKey),
    },
    {
      provide: SIXORBIT_CONFIG_REPOSITORY,
      inject: [PrismaService, SixOrbitCryptoService],
      useFactory: (prisma: PrismaService, crypto: SixOrbitCryptoService) =>
        new PrismaSixOrbitConfigRepository(prisma, crypto),
    },
    {
      provide: SIXORBIT_SYNC_LOG_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaSixOrbitSyncLogRepository(prisma),
    },
    {
      provide: SixOrbitHttpService,
      inject: [SIXORBIT_SYNC_LOG_REPOSITORY],
      useFactory: (syncLog: SixOrbitSyncLogRepository) =>
        new SixOrbitHttpService(syncLog, new Logger(SixOrbitHttpService.name)),
    },
    {
      provide: SixOrbitAuthService,
      inject: [SixOrbitHttpService, SixOrbitRedisCache, SIXORBIT_CONFIG_REPOSITORY],
      useFactory: (
        http: SixOrbitHttpService,
        cache: SixOrbitCache,
        configRepo: SixOrbitConfigRepository,
      ) => new SixOrbitAuthService(http, cache, configRepo, new Logger(SixOrbitAuthService.name)),
    },
    {
      provide: SixOrbitClient,
      inject: [SixOrbitHttpService, SixOrbitAuthService],
      useFactory: (http: SixOrbitHttpService, auth: SixOrbitAuthService) =>
        new SixOrbitClient(http, auth, new Logger(SixOrbitClient.name)),
    },

    {
      provide: SixOrbitImportStatusStore,
      inject: [SixOrbitRedisCache],
      useFactory: (cache: SixOrbitCache) => new SixOrbitImportStatusStore(cache),
    },
    {
      provide: SixOrbitProductPushService,
      inject: [PrismaService, SixOrbitClient],
      useFactory: (prisma: PrismaService, client: SixOrbitClient) =>
        new SixOrbitProductPushService(prisma, client, new Logger(SixOrbitProductPushService.name)),
    },
    {
      provide: SixOrbitProductImportService,
      inject: [PrismaService, SixOrbitClient],
      useFactory: (prisma: PrismaService, client: SixOrbitClient) =>
        new SixOrbitProductImportService(
          prisma,
          client,
          new Logger(SixOrbitProductImportService.name),
        ),
    },

    GetSixOrbitConfigHandler,
    SaveSixOrbitConfigHandler,
    TestSixOrbitConnectionHandler,
    ListSixOrbitSyncLogHandler,
    PushProductOnChangeHandler,
    PushProductToSixOrbitHandler,
    PushPendingProductsHandler,
    GetSixOrbitSyncHealthHandler,
    PruneSixOrbitSyncLogHandler,
    DryRunSixOrbitImportHandler,
    StartSixOrbitImportHandler,
    GetSixOrbitImportStatusHandler,
    ResetSixOrbitImportStatusHandler,
  ],
  exports: [SixOrbitClient, SIXORBIT_SYNC_LOG_REPOSITORY, BullModule],
})
export class SixOrbitModule {}
