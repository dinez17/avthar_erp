import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser, JwtAccessPayload } from '@tiles-erp/shared-types';
import { CONFIG_TOKEN, type AppConfig } from '../../../core/config/configuration';

/** Validates the access token and materialises the authenticated principal. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(CONFIG_TOKEN) config: AppConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  validate(payload: JwtAccessPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      email: payload.email,
      roleIds: payload.roleIds,
      roles: payload.roles,
      permissions: payload.permissions,
      branchIds: payload.branchIds,
      departmentIds: payload.departmentIds,
    };
  }
}
