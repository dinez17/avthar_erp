import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundError } from '@tiles-erp/shared';
import type { UserListItem } from '@tiles-erp/shared-types';
import { USERS_REPOSITORY, type UsersRepository } from '../../domain/users.repository';
import { GetUserQuery } from './get-user.query';

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery, UserListItem> {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}

  async execute(query: GetUserQuery): Promise<UserListItem> {
    const user = await this.users.findById(query.userId);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }
}
