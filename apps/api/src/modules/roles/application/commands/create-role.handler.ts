import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ConflictError } from '@tiles-erp/shared';
import type { RoleListItem } from '@tiles-erp/shared-types';
import { ROLES_REPOSITORY, type RolesRepository } from '../../domain/roles.repository';
import { CreateRoleCommand } from './create-role.command';

@CommandHandler(CreateRoleCommand)
export class CreateRoleHandler implements ICommandHandler<CreateRoleCommand, RoleListItem> {
  constructor(@Inject(ROLES_REPOSITORY) private readonly roles: RolesRepository) {}

  async execute(command: CreateRoleCommand): Promise<RoleListItem> {
    if (await this.roles.nameExists(command.data.name)) {
      throw new ConflictError(`Role "${command.data.name}" already exists`);
    }
    return this.roles.create({ ...command.data, createdBy: command.actorId });
  }
}
