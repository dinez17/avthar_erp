import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { CACHE } from '@tiles-erp/config';
import { UnauthorizedError } from '@tiles-erp/shared';
import type {
  AuthTokens,
  JwtAccessPayload,
  JwtRefreshPayload,
} from '@tiles-erp/shared-types';
import { CONFIG_TOKEN, type AppConfig } from '../../../core/config/configuration';
import { RedisService } from '../../../core/redis/redis.service';
import type { AuthUser } from '../domain/user.entity';

/**
 * Issues, verifies and rotates JWT access/refresh tokens. Refresh tokens are single-use:
 * each token's id is stored in Redis and rotated on refresh so reuse is detectable.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  async issueTokens(user: AuthUser): Promise<AuthTokens> {
    const tokenId = randomUUID();

    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      roleIds: user.roleIds,
      roles: user.roles,
      permissions: user.permissions,
      branchIds: user.branchIds,
      departmentIds: user.departmentIds,
      tokenType: 'access',
    };
    const refreshPayload: JwtRefreshPayload = {
      sub: user.id,
      tokenId,
      tokenType: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.jwt.accessSecret,
        expiresIn: this.config.jwt.accessExpiresIn,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.jwt.refreshSecret,
        expiresIn: this.config.jwt.refreshExpiresIn,
      }),
    ]);

    await this.redis.set(
      CACHE.keys.refreshToken(user.id, tokenId),
      { issuedAt: Date.now() },
      CACHE.TTL_LONG * 24 * 7,
    );

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 };
  }

  async verifyRefresh(token: string): Promise<JwtRefreshPayload> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(token, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
    const exists = await this.redis.get(CACHE.keys.refreshToken(payload.sub, payload.tokenId));
    if (!exists) throw new UnauthorizedError('Refresh token has been revoked');
    return payload;
  }

  async revoke(userId: string, tokenId: string): Promise<void> {
    await this.redis.del(CACHE.keys.refreshToken(userId, tokenId));
  }
}
