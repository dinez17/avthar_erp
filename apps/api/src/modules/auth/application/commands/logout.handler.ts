import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TokenService } from '../../infrastructure/token.service';
import { LogoutCommand } from './logout.command';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand, void> {
  constructor(private readonly tokens: TokenService) {}

  async execute(command: LogoutCommand): Promise<void> {
    try {
      const payload = await this.tokens.verifyRefresh(command.refreshToken);
      await this.tokens.revoke(payload.sub, payload.tokenId);
    } catch {
      // Idempotent logout: an invalid/expired token is treated as already logged out.
    }
  }
}
