import { ConflictError } from '@tiles-erp/shared';
import { CreateRoleHandler } from './create-role.handler';
import { CreateRoleCommand } from './create-role.command';
import type { RolesRepository } from '../../domain/roles.repository';
import type { RoleListItem } from '@tiles-erp/shared-types';

const role: RoleListItem = {
  id: 'r1',
  name: 'BRANCH_MANAGER',
  description: null,
  isSystem: false,
  isSalesRole: false,
  permissions: ['user:read'],
  userCount: 0,
  version: 1,
};

describe('CreateRoleHandler', () => {
  let roles: jest.Mocked<RolesRepository>;
  let handler: CreateRoleHandler;

  beforeEach(() => {
    roles = {
      list: jest.fn(),
      listAll: jest.fn(),
      findById: jest.fn(),
      nameExists: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      listPermissionCodes: jest.fn(),
    };
    handler = new CreateRoleHandler(roles);
  });

  it('creates a role when the name is free', async () => {
    roles.nameExists.mockResolvedValue(false);
    roles.create.mockResolvedValue(role);
    const result = await handler.execute(
      new CreateRoleCommand(
        {
          name: 'BRANCH_MANAGER',
          description: null,
          permissionCodes: ['user:read'],
          isSalesRole: false,
        },
        'actor',
      ),
    );
    expect(result).toBe(role);
  });

  it('rejects duplicate role names', async () => {
    roles.nameExists.mockResolvedValue(true);
    await expect(
      handler.execute(
        new CreateRoleCommand(
          { name: 'ADMIN', description: null, permissionCodes: [], isSalesRole: false },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
