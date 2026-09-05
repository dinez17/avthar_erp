import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UnauthorizedError } from '@tiles-erp/shared';
import type { AuthTokens } from '@tiles-erp/shared-types';
import { USER_REPOSITORY, type UserRepository } from '../../domain/user.repository';
import { PasswordService } from '../../infrastructure/password.service';
import { TokenService } from '../../infrastructure/token.service';
import { LoginCommand } from './login.command';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, AuthTokens> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async execute(command: LoginCommand): Promise<AuthTokens> {
    const user = await this.users.findByEmail(command.email.toLowerCase());
    if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

    const valid = await this.passwords.verify(command.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    return this.tokens.issueTokens(user);
  }
}
