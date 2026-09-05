import { ConflictError } from '@tiles-erp/shared';
import { CreateUserHandler } from './create-user.handler';
import { CreateUserCommand } from './create-user.command';
import type { UsersRepository } from '../../domain/users.repository';
import type { PasswordService } from '../../../auth/infrastructure/password.service';
import type { UserListItem } from '@tiles-erp/shared-types';

const item: UserListItem = {
  id: 'u1',
  email: 'new@tileserp.local',
  firstName: 'New',
  lastName: 'User',
  isActive: true,
  roles: [],
  branches: [],
  departments: [],
  createdAt: new Date().toISOString(),
  version: 1,
};

describe('CreateUserHandler', () => {
  let users: jest.Mocked<UsersRepository>;
  let passwords: jest.Mocked<PasswordService>;
  let handler: CreateUserHandler;

  beforeEach(() => {
    users = {
      emailExists: jest.fn(),
      create: jest.fn(),
      list: jest.fn(),
    listSalesmen: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    passwords = { hash: jest.fn(), verify: jest.fn() } as unknown as jest.Mocked<PasswordService>;
    handler = new CreateUserHandler(users, passwords);
  });

  const command = new CreateUserCommand(
    {
      email: 'New@TilesERP.local',
      password: 'Secret123',
      firstName: 'New',
      lastName: 'User',
      isActive: true,
      roleIds: ['r1'],
      branchIds: [],
      departmentIds: [],
    },
    'actor-1',
  );

  it('hashes the password, lowercases the email and persists', async () => {
    users.emailExists.mockResolvedValue(false);
    passwords.hash.mockResolvedValue('hashed');
    users.create.mockResolvedValue(item);

    const result = await handler.execute(command);

    expect(passwords.hash).toHaveBeenCalledWith('Secret123');
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@tileserp.local', passwordHash: 'hashed' }),
    );
    expect(result).toBe(item);
  });

  it('rejects duplicate emails', async () => {
    users.emailExists.mockResolvedValue(true);
    await expect(handler.execute(command)).rejects.toBeInstanceOf(ConflictError);
    expect(users.create).not.toHaveBeenCalled();
  });
});
