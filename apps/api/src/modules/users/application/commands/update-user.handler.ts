import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { UserListItem } from '@tiles-erp/shared-types';
import { PasswordService } from '../../../auth/infrastructure/password.service';
import { USERS_REPOSITORY, type UsersRepository } from '../../domain/users.repository';
import { UpdateUserCommand } from './update-user.command';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, UserListItem> {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  async execute(command: UpdateUserCommand): Promise<UserListItem> {
    const { password, ...rest } = command.data;
    const passwordHash = password ? await this.passwords.hash(password) : undefined;
    return this.users.update(command.userId, {
      ...rest,
      passwordHash,
      updatedBy: command.actorId,
    });
  }
}
