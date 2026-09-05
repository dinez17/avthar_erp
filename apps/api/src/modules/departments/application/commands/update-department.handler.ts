import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ConflictError } from '@tiles-erp/shared';
import type { DepartmentListItem } from '@tiles-erp/shared-types';
import {
  DEPARTMENTS_REPOSITORY,
  type DepartmentsRepository,
} from '../../domain/departments.repository';
import { UpdateDepartmentCommand } from './update-department.command';

@CommandHandler(UpdateDepartmentCommand)
export class UpdateDepartmentHandler
  implements ICommandHandler<UpdateDepartmentCommand, DepartmentListItem>
{
  constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly departments: DepartmentsRepository,
  ) {}

  async execute(command: UpdateDepartmentCommand): Promise<DepartmentListItem> {
    if (
      command.data.name !== undefined &&
      (await this.departments.nameExists(command.data.name, command.departmentId))
    ) {
      throw new ConflictError(`Department "${command.data.name}" already exists`);
    }
    return this.departments.update(command.departmentId, {
      ...command.data,
      updatedBy: command.actorId,
    });
  }
}
