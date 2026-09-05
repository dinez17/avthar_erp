import type {
  ChangeLeadStageInput,
  CreateLeadInput,
  LeadItem,
  LeadSource,
  LeadStage,
  LeadStageSummary,
  Paginated,
  PaginationQuery,
  UpdateLeadInput,
  UUID,
} from '@tiles-erp/shared-types';

export const LEAD_REPOSITORY = Symbol('LEAD_REPOSITORY');

export interface LeadListFilter {
  stage?: LeadStage;
  source?: LeadSource;
  ownerUserId?: UUID;
  branchId?: UUID;
  campaignId?: UUID;
  /** Only open leads whose follow-up fell due on or before now. */
  followUpDue?: boolean;
}

export type CreateLeadData = CreateLeadInput & {
  code: string;
  /** Resolved snapshot of the owner's display name. */
  ownerName: string | null;
  createdBy: UUID;
};

export type UpdateLeadData = UpdateLeadInput & {
  /** Present only when ownerUserId was supplied and re-resolved. */
  ownerName?: string | null;
  updatedBy: UUID;
};

/** Persistence port for the lead master and its pipeline. */
export interface LeadRepository {
  list(query: PaginationQuery, filter: LeadListFilter): Promise<Paginated<LeadItem>>;
  findById(id: UUID): Promise<LeadItem | null>;
  codeExists(code: string, excludeId?: UUID): Promise<boolean>;
  /** Next sequential code, e.g. LEAD-000042. */
  nextCode(): Promise<string>;
  /** Counts and weighted value per stage, for the pipeline board. */
  pipeline(filter: LeadListFilter): Promise<LeadStageSummary[]>;
  /** Rejects references to a customer, branch or campaign that does not exist. */
  assertReferences(
    customerId: UUID | null,
    branchId: UUID | null,
    campaignId: UUID | null,
  ): Promise<void>;
  /** The owner's display name for the snapshot, or null if the user is gone. */
  ownerName(userId: UUID): Promise<string | null>;
  create(data: CreateLeadData): Promise<LeadItem>;
  update(id: UUID, data: UpdateLeadData): Promise<LeadItem>;
  /** Hand-moves a lead through the pipeline; carries the reason for NOT_INTERESTED. */
  changeStage(
    id: UUID,
    input: ChangeLeadStageInput,
    actorId: UUID,
  ): Promise<LeadItem>;
  /** Stamps the lead converted: links the quotation and moves it to CONVERTED. */
  markConverted(
    id: UUID,
    version: number,
    quotationId: UUID,
    actorId: UUID,
    /** Display name of the converting user, snapshotted on the lead. */
    convertedByName: string | null,
  ): Promise<LeadItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}
