import type { DepartmentListItem, Paginated, PaginationQuery, UUID } from '@tiles-erp/shared-types';

export const DEPARTMENTS_REPOSITORY = Symbol('DEPARTMENTS_REPOSITORY');

export interface CreateDepartmentData {
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: UUID;
}

export interface UpdateDepartmentData {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  updatedBy: UUID;
  version: number;
}

/** Port for department persistence. */
export interface DepartmentsRepository {
  list(query: PaginationQuery): Promise<Paginated<DepartmentListItem>>;
  nameExists(name: string, excludeId?: UUID): Promise<boolean>;
  create(data: CreateDepartmentData): Promise<DepartmentListItem>;
  update(id: UUID, data: UpdateDepartmentData): Promise<DepartmentListItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}
