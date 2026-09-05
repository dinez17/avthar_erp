import { UnauthorizedError, ValidationError } from '@tiles-erp/shared';
import { ChangePasswordHandler } from './change-password.handler';
import { ChangePasswordCommand } from './change-password.command';
import type { UserRepository } from '../../domain/user.repository';
import type { PasswordService } from '../../infrastructure/password.service';
import type { AuthUser } from '../../domain/user.entity';

const user: AuthUser = {
  id: 'u1',
  email: 'a@b.c',
  passwordHash: 'old-hash',
  isActive: true,
  roleIds: [],
  roles: [],
  permissions: [],
  branchIds: [],
  departmentIds: [],
};

describe('ChangePasswordHandler', () => {
  let users: jest.Mocked<UserRepository>;
  let passwords: jest.Mocked<PasswordService>;
  let handler: ChangePasswordHandler;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      updatePassword: jest.fn(),
    };
    passwords = { hash: jest.fn(), verify: jest.fn() } as unknown as jest.Mocked<PasswordService>;
    handler = new ChangePasswordHandler(users, passwords);
  });

  it('verifies the current password and stores the new hash', async () => {
    users.findById.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);
    passwords.hash.mockResolvedValue('new-hash');

    await handler.execute(new ChangePasswordCommand('u1', 'Old12345', 'New12345'));

    expect(passwords.verify).toHaveBeenCalledWith('Old12345', 'old-hash');
    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'new-hash');
  });

  it('rejects a wrong current password', async () => {
    users.findById.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);
    await expect(
      handler.execute(new ChangePasswordCommand('u1', 'wrong', 'New12345')),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(users.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects reusing the same password', async () => {
    users.findById.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);
    await expect(
      handler.execute(new ChangePasswordCommand('u1', 'Same1234', 'Same1234')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
