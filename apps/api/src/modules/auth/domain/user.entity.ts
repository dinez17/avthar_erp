import type { UUID } from '@tiles-erp/shared-types';

/**
 * Authentication domain view of a user. This is a read model owned by the auth module;
 * the full User Management aggregate will be introduced with its own module later.
 */
export interface AuthUser {
  id: UUID;
  email: string;
  passwordHash: string;
  isActive: boolean;
  roleIds: UUID[];
  roles: string[];
  permissions: string[];
  branchIds: UUID[];
  departmentIds: UUID[];
}
