import type { PaginationQuery } from '@tiles-erp/shared-types';

export class ListUsersQuery {
  constructor(public readonly pagination: PaginationQuery) {}
}

export class ListSalesmenQuery {}
