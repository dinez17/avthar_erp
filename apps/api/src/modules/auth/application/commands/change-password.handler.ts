import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UnauthorizedError, ValidationError } from '@tiles-erp/shared';
import { USER_REPOSITORY, type UserRepository } from '../../domain/user.repository';
import { PasswordService } from '../../infrastructure/password.service';
import { ChangePasswordCommand } from './change-password.command';

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const user = await this.users.findById(command.userId);
    if (!user || !user.isActive) throw new UnauthorizedError('User is no longer active');

    const valid = await this.passwords.verify(command.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Current password is incorrect');

    if (command.currentPassword === command.newPassword) {
      throw new ValidationError('New password must differ from the current password');
    }

    const passwordHash = await this.passwords.hash(command.newPassword);
    await this.users.updatePassword(user.id, passwordHash);
  }
}
