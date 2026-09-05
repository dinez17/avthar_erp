import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ROLES_REPOSITORY, type RolesRepository } from '../../domain/roles.repository';
import { ListPermissionsQuery } from './list-permissions.query';

@QueryHandler(ListPermissionsQuery)
export class ListPermissionsHandler implements IQueryHandler<ListPermissionsQuery, string[]> {
  constructor(@Inject(ROLES_REPOSITORY) private readonly roles: RolesRepository) {}

  execute(): Promise<string[]> {
    return this.roles.listPermissionCodes();
  }
}
