import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@tiles-erp/shared';
import { SYSTEM_ROLES } from '@tiles-erp/config';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Authorises the request if the user has at least one of the required roles. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenError('Insufficient role');
    if (user.roles.includes(SYSTEM_ROLES.SUPER_ADMIN)) return true;

    if (!required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenError(`Requires one of roles: ${required.join(', ')}`);
    }
    return true;
  }
}
