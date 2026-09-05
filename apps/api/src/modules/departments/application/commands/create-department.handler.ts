import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ConflictError } from '@tiles-erp/shared';
import type { DepartmentListItem } from '@tiles-erp/shared-types';
import {
  DEPARTMENTS_REPOSITORY,
  type DepartmentsRepository,
} from '../../domain/departments.repository';
import { CreateDepartmentCommand } from './create-department.command';

@CommandHandler(CreateDepartmentCommand)
export class CreateDepartmentHandler
  implements ICommandHandler<CreateDepartmentCommand, DepartmentListItem>
{
  constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly departments: DepartmentsRepository,
  ) {}

  async execute(command: CreateDepartmentCommand): Promise<DepartmentListItem> {
    if (await this.departments.nameExists(command.data.name)) {
      throw new ConflictError(`Department "${command.data.name}" already exists`);
    }
    return this.departments.create({ ...command.data, createdBy: command.actorId });
  }
}
