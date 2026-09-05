import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Paginated, RoleListItem } from '@tiles-erp/shared-types';
import { ROLES_REPOSITORY, type RolesRepository } from '../../domain/roles.repository';
import { ListRolesQuery } from './list-roles.query';

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery, Paginated<RoleListItem>> {
  constructor(@Inject(ROLES_REPOSITORY) private readonly roles: RolesRepository) {}

  execute(query: ListRolesQuery): Promise<Paginated<RoleListItem>> {
    return this.roles.list(query.pagination);
  }
}
