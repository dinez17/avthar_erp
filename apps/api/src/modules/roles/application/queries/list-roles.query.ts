import type { PaginationQuery } from '@tiles-erp/shared-types';

export class ListRolesQuery {
  constructor(public readonly pagination: PaginationQuery) {}
}
