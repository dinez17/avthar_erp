import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { AuditLogItem, Paginated, PaginationQuery } from '@tiles-erp/shared-types';
import {
  AUDIT_REPOSITORY,
  type AuditListFilter,
  type AuditRepository,
} from '../domain/audit.repository';

export class ListAuditLogsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: AuditListFilter,
  ) {}
}

export class ListAuditEntitiesQuery {}

@QueryHandler(ListAuditLogsQuery)
export class ListAuditLogsHandler
  implements IQueryHandler<ListAuditLogsQuery, Paginated<AuditLogItem>>
{
  constructor(@Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository) {}

  execute(query: ListAuditLogsQuery): Promise<Paginated<AuditLogItem>> {
    return this.audit.list(query.pagination, query.filter);
  }
}

@QueryHandler(ListAuditEntitiesQuery)
export class ListAuditEntitiesHandler implements IQueryHandler<ListAuditEntitiesQuery, string[]> {
  constructor(@Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository) {}

  execute(): Promise<string[]> {
    return this.audit.listEntities();
  }
}
