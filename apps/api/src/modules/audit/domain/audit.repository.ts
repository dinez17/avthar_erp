import type { AuditLogItem, Paginated, PaginationQuery } from '@tiles-erp/shared-types';

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

export interface AuditListFilter {
  entity?: string;
  userId?: string;
}

/** Read-only port over the audit trail. */
export interface AuditRepository {
  list(query: PaginationQuery, filter: AuditListFilter): Promise<Paginated<AuditLogItem>>;
  listEntities(): Promise<string[]>;
}
