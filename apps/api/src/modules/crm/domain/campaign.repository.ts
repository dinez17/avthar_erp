import type {
  CampaignChannel,
  CampaignItem,
  CampaignStatus,
  CreateCampaignInput,
  Paginated,
  PaginationQuery,
  UpdateCampaignInput,
  UUID,
} from '@tiles-erp/shared-types';

export const CAMPAIGN_REPOSITORY = Symbol('CAMPAIGN_REPOSITORY');

export interface CampaignListFilter {
  status?: CampaignStatus;
  channel?: CampaignChannel;
}

export type CreateCampaignData = CreateCampaignInput & { code: string; createdBy: UUID };
export type UpdateCampaignData = UpdateCampaignInput & { updatedBy: UUID };

/**
 * Raw attribution counts for one campaign, before the report turns them into ratios. Money
 * is the lead's own expected value, summed; the cost-per and ROI arithmetic lives in the
 * application layer where it can be tested on its own.
 */
export interface CampaignPerformanceAggregate {
  campaignId: UUID;
  code: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  budget: number;
  leadsCount: number;
  convertedCount: number;
  notInterestedCount: number;
  openCount: number;
  pipelineValue: number;
  convertedValue: number;
}

export interface CampaignRepository {
  list(query: PaginationQuery, filter: CampaignListFilter): Promise<Paginated<CampaignItem>>;
  findById(id: UUID): Promise<CampaignItem | null>;
  codeExists(code: string, excludeId?: UUID): Promise<boolean>;
  /** Next sequential code, e.g. CAMP-000042. */
  nextCode(): Promise<string>;
  /** Confirms a campaign exists and is not deleted, for lead attribution. */
  exists(id: UUID): Promise<boolean>;
  create(data: CreateCampaignData): Promise<CampaignItem>;
  update(id: UUID, data: UpdateCampaignData): Promise<CampaignItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
  /** Per-campaign attribution aggregates for the performance report. */
  performanceAggregates(): Promise<CampaignPerformanceAggregate[]>;
}
