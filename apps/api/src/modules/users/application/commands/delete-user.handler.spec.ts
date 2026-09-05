import { ValidationError } from '@tiles-erp/shared';
import { DeleteUserHandler } from './delete-user.handler';
import { DeleteUserCommand } from './delete-user.command';
import type { UsersRepository } from '../../domain/users.repository';

describe('DeleteUserHandler', () => {
  let users: jest.Mocked<UsersRepository>;
  let handler: DeleteUserHandler;

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
    handler = new DeleteUserHandler(users);
  });

  it('soft-deletes another user', async () => {
    await handler.execute(new DeleteUserCommand('target', 'actor'));
    expect(users.softDelete).toHaveBeenCalledWith('target', 'actor');
  });

  it('prevents deleting your own account', async () => {
    await expect(handler.execute(new DeleteUserCommand('same', 'same'))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(users.softDelete).not.toHaveBeenCalled();
  });
});
