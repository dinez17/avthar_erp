import { SetMetadata } from '@nestjs/common';
import type { SystemRole } from '@tiles-erp/config';

export const ROLES_KEY = 'auth:roles';

/** Declares the roles allowed to access a route (any one is sufficient). */
export const RequireRoles = (
  ...roles: (SystemRole | string)[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
