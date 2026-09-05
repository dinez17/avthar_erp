import { UnauthorizedError } from '@tiles-erp/shared';
import { LoginHandler } from './login.handler';
import { LoginCommand } from './login.command';
import type { UserRepository } from '../../domain/user.repository';
import type { PasswordService } from '../../infrastructure/password.service';
import type { TokenService } from '../../infrastructure/token.service';
import type { AuthUser } from '../../domain/user.entity';

const buildUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: '11111111-1111-1111-1111-111111111111',
  email: 'admin@tileserp.local',
  passwordHash: 'hashed',
  isActive: true,
  roleIds: [],
  roles: ['ADMIN'],
  permissions: [],
  branchIds: [],
  departmentIds: [],
  ...overrides,
});

describe('LoginHandler', () => {
  let users: jest.Mocked<UserRepository>;
  let passwords: jest.Mocked<PasswordService>;
  let tokens: jest.Mocked<TokenService>;
  let handler: LoginHandler;

  beforeEach(() => {
    users = { findByEmail: jest.fn(), findById: jest.fn(), updatePassword: jest.fn() };
    passwords = { verify: jest.fn(), hash: jest.fn() } as unknown as jest.Mocked<PasswordService>;
    tokens = { issueTokens: jest.fn() } as unknown as jest.Mocked<TokenService>;
    handler = new LoginHandler(users, passwords, tokens);
  });

  it('issues tokens for valid credentials', async () => {
    users.findByEmail.mockResolvedValue(buildUser());
    passwords.verify.mockResolvedValue(true);
    tokens.issueTokens.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    });

    const result = await handler.execute(new LoginCommand('admin@tileserp.local', 'secret'));

    expect(result.accessToken).toBe('a');
    expect(tokens.issueTokens).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown user', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(handler.execute(new LoginCommand('x@y.z', 'secret'))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('rejects an invalid password', async () => {
    users.findByEmail.mockResolvedValue(buildUser());
    passwords.verify.mockResolvedValue(false);
    await expect(
      handler.execute(new LoginCommand('admin@tileserp.local', 'wrong')),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an inactive user', async () => {
    users.findByEmail.mockResolvedValue(buildUser({ isActive: false }));
    await expect(
      handler.execute(new LoginCommand('admin@tileserp.local', 'secret')),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
