import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundError } from '@tiles-erp/shared';
import type { RoleListItem } from '@tiles-erp/shared-types';
import { ROLES_REPOSITORY, type RolesRepository } from '../../domain/roles.repository';
import { GetRoleQuery } from './get-role.query';

@QueryHandler(GetRoleQuery)
export class GetRoleHandler implements IQueryHandler<GetRoleQuery, RoleListItem> {
  constructor(@Inject(ROLES_REPOSITORY) private readonly roles: RolesRepository) {}

  async execute(query: GetRoleQuery): Promise<RoleListItem> {
    const role = await this.roles.findById(query.id);
    if (!role) throw new NotFoundError('Role not found');
    return role;
  }
}
