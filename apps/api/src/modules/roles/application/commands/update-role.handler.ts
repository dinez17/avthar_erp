import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ConflictError } from '@tiles-erp/shared';
import type { RoleListItem } from '@tiles-erp/shared-types';
import { ROLES_REPOSITORY, type RolesRepository } from '../../domain/roles.repository';
import { UpdateRoleCommand } from './update-role.command';

@CommandHandler(UpdateRoleCommand)
export class UpdateRoleHandler implements ICommandHandler<UpdateRoleCommand, RoleListItem> {
  constructor(@Inject(ROLES_REPOSITORY) private readonly roles: RolesRepository) {}

  async execute(command: UpdateRoleCommand): Promise<RoleListItem> {
    if (
      command.data.name !== undefined &&
      (await this.roles.nameExists(command.data.name, command.roleId))
    ) {
      throw new ConflictError(`Role "${command.data.name}" already exists`);
    }
    return this.roles.update(command.roleId, { ...command.data, updatedBy: command.actorId });
  }
}
