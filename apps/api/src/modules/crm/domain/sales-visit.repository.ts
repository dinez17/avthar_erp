import type {
  CreateSalesVisitInput,
  LeadStage,
  Paginated,
  PaginationQuery,
  SalesVisitItem,
  UpdateSalesVisitInput,
  UUID,
  VisitStatus,
} from '@tiles-erp/shared-types';

export const SALES_VISIT_REPOSITORY = Symbol('SALES_VISIT_REPOSITORY');

export interface SalesVisitListFilter {
  leadId?: UUID;
  salespersonUserId?: UUID;
  status?: VisitStatus;
  /** Only planned visits whose scheduled time has passed. */
  overdue?: boolean;
}

export type CreateSalesVisitData = CreateSalesVisitInput & {
  salespersonName: string | null;
  createdBy: UUID;
};

export type UpdateSalesVisitData = UpdateSalesVisitInput & {
  /** Present only when the salesperson was re-assigned. */
  salespersonName?: string | null;
  updatedBy: UUID;
};

/** What reporting a visit applies to its lead. Omitted keys leave the lead untouched. */
export interface LeadVisitSideEffect {
  stage?: LeadStage;
  nextFollowUpAt?: Date | null;
  lostReason?: string | null;
}

export interface SalesVisitRepository {
  list(query: PaginationQuery, filter: SalesVisitListFilter): Promise<Paginated<SalesVisitItem>>;
  findById(id: UUID): Promise<SalesVisitItem | null>;
  /** The lead's current stage, or null when it does not exist / is deleted. */
  leadStage(leadId: UUID): Promise<LeadStage | null>;
  /** The salesperson's display name for the snapshot. */
  salespersonName(userId: UUID): Promise<string | null>;
  /** Creates the visit and applies the lead side effect (if any) in one transaction. */
  create(
    data: CreateSalesVisitData,
    sideEffect: LeadVisitSideEffect | null,
    actorId: UUID,
  ): Promise<SalesVisitItem>;
  /** Updates the visit (optimistic) and applies the lead side effect in one transaction. */
  update(
    id: UUID,
    data: UpdateSalesVisitData,
    sideEffect: LeadVisitSideEffect | null,
    actorId: UUID,
  ): Promise<SalesVisitItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}
