import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@tiles-erp/shared';
import { SYSTEM_ROLES } from '@tiles-erp/config';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { BRANCH_SCOPE_KEY, type ScopeSource } from '../decorators/scope.decorator';

/** Ensures the targeted branch is within the user's assigned branches. */
@Injectable()
export class BranchGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const source = this.reflector.getAllAndOverride<Required<ScopeSource>>(BRANCH_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!source) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser } & Record<string, Record<string, string>>>();
    const user = request.user;
    if (!user) throw new ForbiddenError('Branch scope denied');
    if (user.roles.includes(SYSTEM_ROLES.SUPER_ADMIN)) return true;

    const branchId = request[source.in]?.[source.key];
    if (!branchId) return true;
    if (!user.branchIds.includes(branchId)) {
      throw new ForbiddenError('You are not assigned to this branch');
    }
    return true;
  }
}
