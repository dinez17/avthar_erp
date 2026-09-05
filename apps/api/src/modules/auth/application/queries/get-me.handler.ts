import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundError } from '@tiles-erp/shared';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { USER_REPOSITORY, type UserRepository } from '../../domain/user.repository';
import { GetMeQuery } from './get-me.query';

@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery, AuthenticatedUser> {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(query: GetMeQuery): Promise<AuthenticatedUser> {
    const user = await this.users.findById(query.userId);
    if (!user) throw new NotFoundError('User not found');
    return {
      id: user.id,
      email: user.email,
      roleIds: user.roleIds,
      roles: user.roles,
      permissions: user.permissions,
      branchIds: user.branchIds,
      departmentIds: user.departmentIds,
    };
  }
}
