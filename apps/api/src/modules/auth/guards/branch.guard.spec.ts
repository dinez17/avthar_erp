import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SYSTEM_ROLES } from '@tiles-erp/config';
import { ForbiddenError } from '@tiles-erp/shared';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { BranchGuard } from './branch.guard';

const baseUser: AuthenticatedUser = {
  id: 'user-1',
  email: 'user@example.com',
  roleIds: [],
  roles: ['BILLING'],
  permissions: [],
  branchIds: ['branch-1'],
  departmentIds: [],
};

const reflector = {
  getAllAndOverride: () => ({ in: 'query', key: 'branchId' }),
} as unknown as Reflector;

function context(user: AuthenticatedUser, branchId: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user, query: { branchId } }) }),
  } as unknown as ExecutionContext;
}

describe('BranchGuard', () => {
  it.each([SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.SUPER_ADMIN])(
    'allows %s to select any branch',
    (role) => {
      const user = { ...baseUser, roles: [role] };
      expect(new BranchGuard(reflector).canActivate(context(user, 'branch-2'))).toBe(true);
    },
  );

  it('keeps ordinary users inside their assigned branches', () => {
    expect(() => new BranchGuard(reflector).canActivate(context(baseUser, 'branch-2'))).toThrow(
      ForbiddenError,
    );
  });
});
