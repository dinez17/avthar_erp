import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@tiles-erp/shared';
import { PERMISSIONS } from '@tiles-erp/config';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { PermissionsGuard } from './permissions.guard';

const context = (user?: AuthenticatedUser): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const baseUser: AuthenticatedUser = {
  id: '1',
  email: 'e',
  roleIds: [],
  roles: ['STAFF'],
  permissions: [PERMISSIONS.USER_READ],
  branchIds: [],
  departmentIds: [],
};

describe('PermissionsGuard', () => {
  it('allows when no permissions are required', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    expect(new PermissionsGuard(reflector).canActivate(context(baseUser))).toBe(true);
  });

  it('allows when the user has the required permission', () => {
    const reflector = {
      getAllAndOverride: () => [PERMISSIONS.USER_READ],
    } as unknown as Reflector;
    expect(new PermissionsGuard(reflector).canActivate(context(baseUser))).toBe(true);
  });

  it('bypasses checks for SUPER_ADMIN', () => {
    const reflector = {
      getAllAndOverride: () => [PERMISSIONS.USER_DELETE],
    } as unknown as Reflector;
    const admin = { ...baseUser, roles: ['SUPER_ADMIN'] };
    expect(new PermissionsGuard(reflector).canActivate(context(admin))).toBe(true);
  });

  it('denies when a required permission is missing', () => {
    const reflector = {
      getAllAndOverride: () => [PERMISSIONS.USER_DELETE],
    } as unknown as Reflector;
    expect(() => new PermissionsGuard(reflector).canActivate(context(baseUser))).toThrow(
      ForbiddenError,
    );
  });
});
