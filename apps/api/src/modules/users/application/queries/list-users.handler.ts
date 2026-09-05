import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Paginated, SalesmanItem, UserListItem } from '@tiles-erp/shared-types';
import { USERS_REPOSITORY, type UsersRepository } from '../../domain/users.repository';
import { ListSalesmenQuery, ListUsersQuery } from './list-users.query';

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery, Paginated<UserListItem>> {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}

  execute(query: ListUsersQuery): Promise<Paginated<UserListItem>> {
    return this.users.list(query.pagination);
  }
}

@QueryHandler(ListSalesmenQuery)
export class ListSalesmenHandler implements IQueryHandler<ListSalesmenQuery, SalesmanItem[]> {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}

  execute(): Promise<SalesmanItem[]> {
    return this.users.listSalesmen();
  }
}
