import type { PaginationQuery } from '@tiles-erp/shared-types';

export class ListDepartmentsQuery {
  constructor(public readonly pagination: PaginationQuery) {}
}
