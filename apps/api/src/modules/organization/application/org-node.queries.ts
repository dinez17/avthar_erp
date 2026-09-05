import type { PaginationQuery, UUID } from '@tiles-erp/shared-types';

export class ListOrgNodesQueryBase {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly parentId?: UUID,
  ) {}
}

export class ListCompaniesQuery extends ListOrgNodesQueryBase {}
export class ListBranchesQuery extends ListOrgNodesQueryBase {}
export class ListGodownsQuery extends ListOrgNodesQueryBase {}
export class ListGatesQuery extends ListOrgNodesQueryBase {}
export class ListRacksQuery extends ListOrgNodesQueryBase {}
