import type { ISODateString, UUID } from './common';
import type { QuotationItem, QuotationLineInput } from './sales';

/** Where a lead came in from, used for source-of-business reporting. */
export type LeadSource =
  | 'WALK_IN'
  | 'PHONE'
  | 'REFERRAL'
  | 'WEBSITE'
  | 'EXHIBITION'
  | 'SOCIAL_MEDIA'
  | 'ADVERTISEMENT'
  | 'OTHER';

/**
 * The pipeline a lead moves through. `CONVERTED` is reached the moment the lead is turned
 * into a quotation; `NOT_INTERESTED` is the dead-end and carries a reason.
 */
export type LeadStage = 'NEW' | 'FOLLOW_UP' | 'CONVERTED' | 'NOT_INTERESTED';

/** Read model for a lead on the pipeline board and grid. */
export interface LeadItem {
  id: UUID;
  code: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  city: string | null;
  source: LeadSource;
  stage: LeadStage;
  ownerUserId: UUID | null;
  ownerName: string | null;
  expectedValue: number;
  nextFollowUpAt: ISODateString | null;
  /** Set once the lead has been linked to a customer master. */
  customerId: UUID | null;
  /** The branch working the lead; required before it can be quoted. */
  branchId: UUID | null;
  /** The marketing campaign this lead is attributed to, if any. */
  campaignId: UUID | null;
  campaignName: string | null;
  /** The quotation this lead became, set once on conversion. */
  convertedQuotationId: UUID | null;
  convertedAt: ISODateString | null;
  /** Who performed the conversion, with a name snapshot. */
  convertedByUserId: UUID | null;
  convertedByName: string | null;
  lostReason: string | null;
  notes: string | null;
  /** True when a follow-up is due in the past and the lead is still open. */
  followUpOverdue: boolean;
  version: number;
}

export interface CreateLeadInput {
  /** Omitted, the API assigns the next sequential code. */
  code?: string;
  name: string;
  companyName?: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  city?: string;
  source?: LeadSource;
  stage?: LeadStage;
  ownerUserId?: UUID | null;
  expectedValue?: number;
  nextFollowUpAt?: ISODateString | null;
  customerId?: UUID | null;
  branchId?: UUID | null;
  campaignId?: UUID | null;
  notes?: string;
}

export interface UpdateLeadInput extends Partial<CreateLeadInput> {
  version: number;
}

/**
 * Move a lead along the pipeline by hand. The `CONVERTED` stage is reached only by
 * conversion, never set directly, and `NOT_INTERESTED` carries a reason.
 */
export interface ChangeLeadStageInput {
  version: number;
  stage: Exclude<LeadStage, 'CONVERTED'>;
  /** Required when moving to `NOT_INTERESTED`. */
  lostReason?: string;
}

/**
 * Convert a lead into a draft quotation through the quotation desk. The lines are the
 * products the salesperson has settled on; everything else defaults from the lead.
 */
export interface ConvertLeadInput {
  /** The branch to quote from; defaults to the lead's own branch when it has one. */
  branchId?: UUID;
  /** Customer master to quote for; defaults to the lead's linked customer if any. */
  customerId?: UUID | null;
  validUntil?: ISODateString;
  remarks?: string;
  lines: QuotationLineInput[];
}

/** The quotation produced by a conversion, returned with the lead's new state. */
export interface ConvertLeadResult {
  lead: LeadItem;
  quotation: QuotationItem;
}

/** One column of the pipeline board: how many leads sit in a stage and their weight. */
export interface LeadStageSummary {
  stage: LeadStage;
  count: number;
  expectedValue: number;
}

// ---- Telecalling ----

export type CallDirection = 'OUTBOUND' | 'INBOUND';

/**
 * How a call ended. Connection outcomes and sentiment sit in one flat list, matching how a
 * telecaller picks a single disposition when they hang up.
 */
export type CallDisposition =
  | 'CONNECTED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'SWITCHED_OFF'
  | 'WRONG_NUMBER'
  | 'CALLBACK'
  | 'INTERESTED'
  | 'NOT_INTERESTED';

/** One logged call worked against a lead. */
export interface CallLogItem {
  id: UUID;
  leadId: UUID;
  /** Lead identifiers, carried for a cross-lead call list. */
  leadCode: string | null;
  leadName: string | null;
  callerUserId: UUID | null;
  callerName: string | null;
  direction: CallDirection;
  disposition: CallDisposition;
  durationSec: number | null;
  calledAt: ISODateString;
  /** Set on a CALLBACK disposition; also written to the lead's follow-up. */
  callbackAt: ISODateString | null;
  notes: string | null;
  version: number;
}

export interface CreateCallLogInput {
  leadId: UUID;
  direction?: CallDirection;
  disposition: CallDisposition;
  durationSec?: number;
  calledAt?: ISODateString;
  /** Required by validation when the disposition is CALLBACK. */
  callbackAt?: ISODateString | null;
  notes?: string;
}

// ---- Marketing campaigns ----

export type CampaignChannel =
  | 'PHONE'
  | 'WHATSAPP'
  | 'SMS'
  | 'EMAIL'
  | 'SOCIAL_MEDIA'
  | 'EXHIBITION'
  | 'PRINT'
  | 'HOARDING'
  | 'REFERRAL'
  | 'WEBSITE'
  | 'OTHER';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface CampaignItem {
  id: UUID;
  code: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  budget: number;
  startDate: ISODateString | null;
  endDate: ISODateString | null;
  objective: string | null;
  notes: string | null;
  version: number;
}

export interface CreateCampaignInput {
  code?: string;
  name: string;
  channel: CampaignChannel;
  status?: CampaignStatus;
  budget?: number;
  startDate?: ISODateString | null;
  endDate?: ISODateString | null;
  objective?: string;
  notes?: string;
}

export interface UpdateCampaignInput extends Partial<CreateCampaignInput> {
  version: number;
}

/**
 * One campaign's return: the budget set against the leads it drew and how they moved.
 *
 * Money uses the lead's expected value — the same figure the pipeline board weights — so a
 * campaign's "value" and the sales pipeline never disagree. `roiPct` compares the value of
 * converted leads against the spend; it is null when there is no budget to divide by.
 */
export interface CampaignPerformanceRow {
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
  /** Expected value of every attributed lead. */
  pipelineValue: number;
  /** Expected value of the converted leads only. */
  convertedValue: number;
  /** budget / leadsCount, or null when no leads yet. */
  costPerLead: number | null;
  /** budget / convertedCount, or null when nothing converted. */
  costPerConversion: number | null;
  /** convertedCount / leadsCount, 0..1. */
  conversionRate: number;
  /** (convertedValue − budget) / budget × 100, or null when no budget. */
  roiPct: number | null;
}

// ---- Sales visits ----

export type VisitPurpose =
  | 'INTRODUCTION'
  | 'PRODUCT_DEMO'
  | 'QUOTATION_DISCUSSION'
  | 'NEGOTIATION'
  | 'SITE_MEASUREMENT'
  | 'PAYMENT_FOLLOWUP'
  | 'RELATIONSHIP'
  | 'OTHER';

export type VisitStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

/** The result of a completed visit; NOT_INTERESTED closes the lead, the rest keep it open. */
export type VisitOutcome =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'FOLLOW_UP_NEEDED'
  | 'QUOTATION_REQUESTED'
  | 'ORDER_DISCUSSED';

/** One field visit scheduled or reported against a lead. */
export interface SalesVisitItem {
  id: UUID;
  leadId: UUID;
  /** Lead identifiers, carried for a cross-lead visit list. */
  leadCode: string | null;
  leadName: string | null;
  salespersonUserId: UUID | null;
  salespersonName: string | null;
  purpose: VisitPurpose;
  status: VisitStatus;
  outcome: VisitOutcome | null;
  scheduledAt: ISODateString;
  completedAt: ISODateString | null;
  location: string | null;
  notes: string | null;
  /** The next action date agreed at the visit; also written to the lead's follow-up. */
  nextFollowUpAt: ISODateString | null;
  /** True when a planned visit's scheduled time is in the past. */
  overdue: boolean;
  version: number;
}

export interface CreateSalesVisitInput {
  leadId: UUID;
  salespersonUserId?: UUID | null;
  purpose?: VisitPurpose;
  /** Defaults to PLANNED. */
  status?: VisitStatus;
  /** Required by validation when the status is COMPLETED. */
  outcome?: VisitOutcome | null;
  scheduledAt: ISODateString;
  completedAt?: ISODateString | null;
  location?: string;
  notes?: string;
  nextFollowUpAt?: ISODateString | null;
}

export interface UpdateSalesVisitInput extends Partial<Omit<CreateSalesVisitInput, 'leadId'>> {
  version: number;
}

