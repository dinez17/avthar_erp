import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import { USERS_REPOSITORY, type UsersRepository } from '../../domain/users.repository';
import { DeleteUserCommand } from './delete-user.command';

@CommandHandler(DeleteUserCommand)
export class DeleteUserHandler implements ICommandHandler<DeleteUserCommand, void> {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    if (command.userId === command.actorId) {
      throw new ValidationError('You cannot delete your own account');
    }
    await this.users.softDelete(command.userId, command.actorId);
  }
}
