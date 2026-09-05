import { Injectable } from '@nestjs/common';
import type { SixOrbitCache } from '@tiles-erp/sixorbit';
import { RedisService } from '../../../core/redis/redis.service';

/**
 * Backs the package's cache port with the API's shared Redis connection.
 *
 * The package deliberately owns no Redis client of its own — the API has one and the
 * worker has its own, and a third would be a third connection to manage. All this adapter
 * adds is the atomic lock, which the port needs and `RedisService` does not expose.
 */
@Injectable()
export class SixOrbitRedisCache implements SixOrbitCache {
  constructor(private readonly redis: RedisService) {}

  get<T>(key: string): Promise<T | null> {
    return this.redis.get<T>(key);
  }

  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.redis.set(key, value, ttlSeconds);
  }

  del(key: string): Promise<void> {
    return this.redis.del(key);
  }

  /**
   * SET NX PX — one round trip, and atomic across processes.
   *
   * That atomicity is the whole reason this method exists: SixOrbit issues one session
   * per user, so if the API and the worker can both decide to log in at the same moment,
   * one of them can invalidate the other's token.
   */
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.client.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }
}
