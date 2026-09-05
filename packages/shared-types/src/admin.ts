import type { UUID, ISODateString } from './common';

/** Read model returned by user management list/detail endpoints. */
export interface UserListItem {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: { id: UUID; name: string }[];
  branches: { id: UUID; name: string }[];
  departments: { id: UUID; name: string }[];
  createdAt: ISODateString;
  version: number;
}

/** Read model for role management. */
export interface RoleListItem {
  id: UUID;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** Users with this role appear in salesman pickers. */
  isSalesRole: boolean;
  permissions: string[];
  userCount: number;
  version: number;
}

/** Read model for department management. */
export interface DepartmentListItem {
  id: UUID;
  name: string;
  description: string | null;
  isActive: boolean;
  userCount: number;
  version: number;
}

/** A user who may be credited as the salesperson on a sales document. */
export interface SalesmanItem {
  id: UUID;
  name: string;
  email: string;
}
