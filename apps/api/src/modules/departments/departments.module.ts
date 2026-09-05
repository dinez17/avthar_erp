import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DEPARTMENTS_REPOSITORY } from './domain/departments.repository';
import { PrismaDepartmentsRepository } from './infrastructure/prisma-departments.repository';
import { DepartmentsController } from './presentation/departments.controller';
import { CreateDepartmentHandler } from './application/commands/create-department.handler';
import { UpdateDepartmentHandler } from './application/commands/update-department.handler';
import { DeleteDepartmentHandler } from './application/commands/delete-department.handler';
import { ListDepartmentsHandler } from './application/queries/list-departments.handler';

/** Department management. */
@Module({
  imports: [CqrsModule],
  controllers: [DepartmentsController],
  providers: [
    { provide: DEPARTMENTS_REPOSITORY, useClass: PrismaDepartmentsRepository },
    CreateDepartmentHandler,
    UpdateDepartmentHandler,
    DeleteDepartmentHandler,
    ListDepartmentsHandler,
  ],
})
export class DepartmentsModule {}
