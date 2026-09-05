import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ConflictError } from '@tiles-erp/shared';
import type { UserListItem } from '@tiles-erp/shared-types';
import { PasswordService } from '../../../auth/infrastructure/password.service';
import { USERS_REPOSITORY, type UsersRepository } from '../../domain/users.repository';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, UserListItem> {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  async execute(command: CreateUserCommand): Promise<UserListItem> {
    const email = command.data.email.toLowerCase();
    if (await this.users.emailExists(email)) {
      throw new ConflictError(`A user with email ${email} already exists`);
    }
    const passwordHash = await this.passwords.hash(command.data.password);
    return this.users.create({
      email,
      passwordHash,
      firstName: command.data.firstName,
      lastName: command.data.lastName,
      isActive: command.data.isActive,
      roleIds: command.data.roleIds,
      branchIds: command.data.branchIds,
      departmentIds: command.data.departmentIds,
      createdBy: command.actorId,
    });
  }
}
