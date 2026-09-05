import type {
  CallDisposition,
  CallLogItem,
  CreateCallLogInput,
  LeadStage,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';

export const CALL_LOG_REPOSITORY = Symbol('CALL_LOG_REPOSITORY');

export interface CallLogListFilter {
  leadId?: UUID;
  callerUserId?: UUID;
  disposition?: CallDisposition;
  /** Only calls with a callback still due on or before now. */
  callbackDue?: boolean;
}

export type CreateCallLogData = CreateCallLogInput & {
  /** Resolved snapshot of the caller's display name. */
  callerName: string | null;
  createdBy: UUID;
};

/**
 * What logging a call applies to its lead. Every key is optional; omitted keys leave the
 * lead untouched. This is the automation the sprint calls for — a callback sets the lead's
 * next follow-up, a "not interested" closes it — kept in one place so the transaction that
 * writes the call writes the consequence too.
 */
export interface LeadCallSideEffect {
  stage?: LeadStage;
  nextFollowUpAt?: Date | null;
  lostReason?: string | null;
}

/** Persistence port for the telecalling history. */
export interface CallLogRepository {
  list(query: PaginationQuery, filter: CallLogListFilter): Promise<Paginated<CallLogItem>>;
  findById(id: UUID): Promise<CallLogItem | null>;
  /** The lead's current stage, or null when it does not exist / is deleted. */
  leadStage(leadId: UUID): Promise<LeadStage | null>;
  /** The caller's display name for the snapshot, or null if the user is gone. */
  callerName(userId: UUID): Promise<string | null>;
  /**
   * Records the call and applies the lead side effect (if any) in one transaction, so a
   * logged callback and the follow-up it sets can never drift apart.
   */
  create(
    data: CreateCallLogData,
    sideEffect: LeadCallSideEffect | null,
    actorId: UUID,
  ): Promise<CallLogItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}
