import type {
  Paginated,
  PaginationQuery,
  SalesmanItem,
  UserListItem,
  UUID,
} from '@tiles-erp/shared-types';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roleIds: UUID[];
  branchIds: UUID[];
  departmentIds: UUID[];
  createdBy: UUID;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  passwordHash?: string;
  roleIds?: UUID[];
  branchIds?: UUID[];
  departmentIds?: UUID[];
  updatedBy: UUID;
  /** Optimistic concurrency token the client last saw. */
  version: number;
}

/** Port for user management persistence. */
export interface UsersRepository {
  list(query: PaginationQuery): Promise<Paginated<UserListItem>>;
  /** Active users holding a role flagged as a sales role. */
  listSalesmen(): Promise<SalesmanItem[]>;
  findById(id: UUID): Promise<UserListItem | null>;
  emailExists(email: string, excludeId?: UUID): Promise<boolean>;
  create(data: CreateUserData): Promise<UserListItem>;
  update(id: UUID, data: UpdateUserData): Promise<UserListItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}
