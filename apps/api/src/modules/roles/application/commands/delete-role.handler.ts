import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ROLES_REPOSITORY, type RolesRepository } from '../../domain/roles.repository';
import { DeleteRoleCommand } from './delete-role.command';

@CommandHandler(DeleteRoleCommand)
export class DeleteRoleHandler implements ICommandHandler<DeleteRoleCommand, void> {
  constructor(@Inject(ROLES_REPOSITORY) private readonly roles: RolesRepository) {}

  async execute(command: DeleteRoleCommand): Promise<void> {
    await this.roles.softDelete(command.roleId, command.actorId);
  }
}
