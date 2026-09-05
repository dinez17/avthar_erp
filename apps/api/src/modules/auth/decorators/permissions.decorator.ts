import { SetMetadata } from '@nestjs/common';
import type { PermissionValue } from '@tiles-erp/config';

export const PERMISSIONS_KEY = 'auth:permissions';

/** Declares the permissions required to access a route (all must be present). */
export const RequirePermissions = (
  ...permissions: PermissionValue[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
