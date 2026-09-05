import { Logger, type Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
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
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker-config';
import { PrismaService } from '../prisma.service';

export const SIXORBIT_REDIS = 'SIXORBIT_REDIS';

/**
 * The worker's Redis connection, kept separate from BullMQ's.
 *
 * BullMQ takes ownership of the connection it is given — it blocks on it — so sharing one
 * would mean the session lookup queueing behind whatever the queue is waiting for.
 */
class WorkerSixOrbitCache implements SixOrbitCache {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds) await this.redis.set(key, payload, 'EX', ttlSeconds);
    else await this.redis.set(key, payload);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(key, '1', 'PX', ttlMs, 'NX')) === 'OK';
  }
}

/**
 * The same SixOrbit stack the API builds, assembled here for the worker.
 *
 * Both applications construct the classes from `@tiles-erp/sixorbit` rather than either
 * of them owning the implementation, which is the whole reason that package exists: the
 * worker consumes the queue and cannot import from `apps/api`.
 */
export const sixOrbitProviders: Provider[] = [
  {
    provide: SIXORBIT_REDIS,
    inject: [WORKER_CONFIG],
    useFactory: (config: WorkerConfig): Redis =>
      new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        maxRetriesPerRequest: null,
      }),
  },
  {
    provide: WorkerSixOrbitCache,
    inject: [SIXORBIT_REDIS],
    useFactory: (redis: Redis) => new WorkerSixOrbitCache(redis),
  },
  {
    provide: SixOrbitCryptoService,
    inject: [WORKER_CONFIG],
    useFactory: (config: WorkerConfig) => new SixOrbitCryptoService(config.sixorbit.encKey),
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
    inject: [SixOrbitHttpService, WorkerSixOrbitCache, SIXORBIT_CONFIG_REPOSITORY],
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
    inject: [WorkerSixOrbitCache],
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
];
