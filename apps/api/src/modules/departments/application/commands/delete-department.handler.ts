import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  DEPARTMENTS_REPOSITORY,
  type DepartmentsRepository,
} from '../../domain/departments.repository';
import { DeleteDepartmentCommand } from './delete-department.command';

@CommandHandler(DeleteDepartmentCommand)
export class DeleteDepartmentHandler implements ICommandHandler<DeleteDepartmentCommand, void> {
  constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly departments: DepartmentsRepository,
  ) {}

  async execute(command: DeleteDepartmentCommand): Promise<void> {
    await this.departments.softDelete(command.departmentId, command.actorId);
  }
}
