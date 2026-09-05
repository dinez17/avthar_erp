import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { DepartmentListItem, Paginated } from '@tiles-erp/shared-types';
import {
  DEPARTMENTS_REPOSITORY,
  type DepartmentsRepository,
} from '../../domain/departments.repository';
import { ListDepartmentsQuery } from './list-departments.query';

@QueryHandler(ListDepartmentsQuery)
export class ListDepartmentsHandler
  implements IQueryHandler<ListDepartmentsQuery, Paginated<DepartmentListItem>>
{
  constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly departments: DepartmentsRepository,
  ) {}

  execute(query: ListDepartmentsQuery): Promise<Paginated<DepartmentListItem>> {
    return this.departments.list(query.pagination);
  }
}
