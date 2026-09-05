import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@tiles-erp/shared';
import { SYSTEM_ROLES, type PermissionValue } from '@tiles-erp/config';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/** Authorises the request only if the user holds every required permission. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionValue[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenError('Insufficient permissions');
    if (user.roles.includes(SYSTEM_ROLES.SUPER_ADMIN)) return true;

    const granted = new Set(user.permissions);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      throw new ForbiddenError(`Missing permissions: ${missing.join(', ')}`);
    }
    return true;
  }
}
