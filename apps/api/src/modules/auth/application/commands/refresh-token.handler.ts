import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UnauthorizedError } from '@tiles-erp/shared';
import type { AuthTokens } from '@tiles-erp/shared-types';
import { USER_REPOSITORY, type UserRepository } from '../../domain/user.repository';
import { TokenService } from '../../infrastructure/token.service';
import { RefreshTokenCommand } from './refresh-token.command';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand, AuthTokens> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly tokens: TokenService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthTokens> {
    const payload = await this.tokens.verifyRefresh(command.refreshToken);
    // Rotate: revoke the presented token before issuing a new pair.
    await this.tokens.revoke(payload.sub, payload.tokenId);

    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedError('User is no longer active');

    return this.tokens.issueTokens(user);
  }
}
