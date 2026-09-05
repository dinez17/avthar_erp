import { ConflictError, ValidationError } from '@tiles-erp/shared';
import type { PortalAccountItem } from '@tiles-erp/shared-types';
import { CreatePortalAccountCommand, CreatePortalAccountHandler } from './portal-account.handlers';
import type { PortalAccountRepository } from '../domain/portal-account.repository';
import type { PasswordService } from '../../auth/infrastructure/password.service';

const account = { id: 'a1', email: 'sup@x.com' } as PortalAccountItem;

const mockRepo = (): jest.Mocked<PortalAccountRepository> => ({
  list: jest.fn(),
  findById: jest.fn(),
  partyName: jest.fn().mockResolvedValue('Acme Tiles'),
  findUserIdByEmail: jest.fn().mockResolvedValue(null),
  provisionUser: jest.fn().mockResolvedValue('u-new'),
  linkExists: jest.fn().mockResolvedValue(false),
  createAccount: jest.fn().mockResolvedValue(account),
  setActive: jest.fn(),
  softDelete: jest.fn(),
  partiesForUser: jest.fn(),
  hasSupplierAccess: jest.fn(),
});

const passwords = (): jest.Mocked<Pick<PasswordService, 'hash'>> => ({
  hash: jest.fn().mockResolvedValue('hashed'),
});

const cmd = () =>
  new CreatePortalAccountCommand(
    { partyType: 'SUPPLIER', supplierId: 's1', email: 'Sup@X.com', fullName: 'Ramesh Kumar' },
    'admin',
  );

describe('CreatePortalAccountHandler', () => {
  it('mints a login with a one-time password when the email is new', async () => {
    const repo = mockRepo();
    const pw = passwords();
    const handler = new CreatePortalAccountHandler(repo, pw as unknown as PasswordService);
    const result = await handler.execute(cmd());
    expect(repo.provisionUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'sup@x.com', roleName: 'SUPPLIER', passwordHash: 'hashed' }),
    );
    expect(result.temporaryPassword).toBeTruthy();
    expect(repo.createAccount).toHaveBeenCalledWith('u-new', 'SUPPLIER', 's1', 'admin');
  });

  it('links an existing user without a new password', async () => {
    const repo = mockRepo();
    repo.findUserIdByEmail.mockResolvedValue('u-existing');
    const handler = new CreatePortalAccountHandler(repo, passwords() as unknown as PasswordService);
    const result = await handler.execute(cmd());
    expect(repo.provisionUser).not.toHaveBeenCalled();
    expect(result.temporaryPassword).toBeNull();
    expect(repo.createAccount).toHaveBeenCalledWith('u-existing', 'SUPPLIER', 's1', 'admin');
  });

  it('rejects a party that does not exist', async () => {
    const repo = mockRepo();
    repo.partyName.mockResolvedValue(null);
    const handler = new CreatePortalAccountHandler(repo, passwords() as unknown as PasswordService);
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a supplier party type with no supplier id', async () => {
    const repo = mockRepo();
    const handler = new CreatePortalAccountHandler(repo, passwords() as unknown as PasswordService);
    await expect(
      handler.execute(
        new CreatePortalAccountCommand(
          { partyType: 'SUPPLIER', email: 'a@b.com', fullName: 'A B' },
          'admin',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a duplicate link', async () => {
    const repo = mockRepo();
    repo.linkExists.mockResolvedValue(true);
    const handler = new CreatePortalAccountHandler(repo, passwords() as unknown as PasswordService);
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(ConflictError);
  });
});
