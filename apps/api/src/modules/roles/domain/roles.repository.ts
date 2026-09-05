import type { Paginated, PaginationQuery, RoleListItem, UUID } from '@tiles-erp/shared-types';

export const ROLES_REPOSITORY = Symbol('ROLES_REPOSITORY');

export interface CreateRoleData {
  name: string;
  description: string | null;
  permissionCodes: string[];
  isSalesRole: boolean;
  createdBy: UUID;
}

export interface UpdateRoleData {
  name?: string;
  description?: string | null;
  permissionCodes?: string[];
  isSalesRole?: boolean;
  updatedBy: UUID;
  version: number;
}

/** Port for role management persistence. */
export interface RolesRepository {
  list(query: PaginationQuery): Promise<Paginated<RoleListItem>>;
  listAll(): Promise<RoleListItem[]>;
  findById(id: UUID): Promise<RoleListItem | null>;
  nameExists(name: string, excludeId?: UUID): Promise<boolean>;
  create(data: CreateRoleData): Promise<RoleListItem>;
  update(id: UUID, data: UpdateRoleData): Promise<RoleListItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
  listPermissionCodes(): Promise<string[]>;
}
