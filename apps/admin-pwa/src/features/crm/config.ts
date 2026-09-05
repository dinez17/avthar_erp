import type {
  CallDirection,
  CallDisposition,
  CampaignChannel,
  CampaignStatus,
  LeadSource,
  LeadStage,
  VisitOutcome,
  VisitPurpose,
  VisitStatus,
} from '@tiles-erp/shared-types';

export const STAGES: LeadStage[] = ['NEW', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED'];

/** Stages a user may set from the pipeline menu; CONVERTED is reached only by conversion. */
export const HAND_STAGES: Exclude<LeadStage, 'CONVERTED'>[] = ['NEW', 'FOLLOW_UP', 'NOT_INTERESTED'];

/** Stages a lead can be created in. */
export const INITIAL_STAGES: LeadStage[] = ['NEW', 'FOLLOW_UP'];

export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'New',
  FOLLOW_UP: 'Follow-up',
  CONVERTED: 'Converted',
  NOT_INTERESTED: 'Not interested',
};

export const STAGE_COLORS: Record<LeadStage, 'default' | 'info' | 'primary' | 'success' | 'error'> =
  {
    NEW: 'default',
    FOLLOW_UP: 'info',
    CONVERTED: 'success',
    NOT_INTERESTED: 'error',
  };

export const SOURCES: LeadSource[] = [
  'WALK_IN',
  'PHONE',
  'REFERRAL',
  'WEBSITE',
  'EXHIBITION',
  'SOCIAL_MEDIA',
  'ADVERTISEMENT',
  'OTHER',
];

export const SOURCE_LABELS: Record<LeadSource, string> = {
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  EXHIBITION: 'Exhibition',
  SOCIAL_MEDIA: 'Social media',
  ADVERTISEMENT: 'Advertisement',
  OTHER: 'Other',
};

export const money = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ---- Telecalling ----

export const DIRECTIONS: CallDirection[] = ['OUTBOUND', 'INBOUND'];

export const DIRECTION_LABELS: Record<CallDirection, string> = {
  OUTBOUND: 'Outbound',
  INBOUND: 'Inbound',
};

export const DISPOSITIONS: CallDisposition[] = [
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'SWITCHED_OFF',
  'WRONG_NUMBER',
  'CALLBACK',
  'INTERESTED',
  'NOT_INTERESTED',
];

export const DISPOSITION_LABELS: Record<CallDisposition, string> = {
  CONNECTED: 'Connected',
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  SWITCHED_OFF: 'Switched off',
  WRONG_NUMBER: 'Wrong number',
  CALLBACK: 'Callback',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
};

export const DISPOSITION_COLORS: Record<
  CallDisposition,
  'default' | 'info' | 'primary' | 'success' | 'warning' | 'error'
> = {
  CONNECTED: 'success',
  NO_ANSWER: 'default',
  BUSY: 'default',
  SWITCHED_OFF: 'default',
  WRONG_NUMBER: 'warning',
  CALLBACK: 'info',
  INTERESTED: 'primary',
  NOT_INTERESTED: 'error',
};

/** Seconds → "m:ss", for the call history. */
export const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ---- Marketing campaigns ----

export const CAMPAIGN_CHANNELS: CampaignChannel[] = [
  'PHONE',
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'SOCIAL_MEDIA',
  'EXHIBITION',
  'PRINT',
  'HOARDING',
  'REFERRAL',
  'WEBSITE',
  'OTHER',
];

export const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  PHONE: 'Phone',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
  SOCIAL_MEDIA: 'Social media',
  EXHIBITION: 'Exhibition',
  PRINT: 'Print',
  HOARDING: 'Hoarding',
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  OTHER: 'Other',
};

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const CAMPAIGN_STATUS_COLORS: Record<
  CampaignStatus,
  'default' | 'info' | 'success' | 'warning' | 'error'
> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'info',
  CANCELLED: 'error',
};

/** A ratio (0..1) as a percentage string. */
export const percent = (ratio: number): string => `${Math.round(ratio * 1000) / 10}%`;

/** ROI percent → signed string, or "—" when there is no budget. */
export const roiLabel = (roiPct: number | null): string =>
  roiPct === null ? '—' : `${roiPct > 0 ? '+' : ''}${roiPct}%`;

// ---- Sales visits ----

export const VISIT_PURPOSES: VisitPurpose[] = [
  'INTRODUCTION',
  'PRODUCT_DEMO',
  'QUOTATION_DISCUSSION',
  'NEGOTIATION',
  'SITE_MEASUREMENT',
  'PAYMENT_FOLLOWUP',
  'RELATIONSHIP',
  'OTHER',
];

export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  INTRODUCTION: 'Introduction',
  PRODUCT_DEMO: 'Product demo',
  QUOTATION_DISCUSSION: 'Quotation discussion',
  NEGOTIATION: 'Negotiation',
  SITE_MEASUREMENT: 'Site measurement',
  PAYMENT_FOLLOWUP: 'Payment follow-up',
  RELATIONSHIP: 'Relationship',
  OTHER: 'Other',
};

export const VISIT_STATUSES: VisitStatus[] = ['PLANNED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  PLANNED: 'Planned',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

export const VISIT_STATUS_COLORS: Record<
  VisitStatus,
  'default' | 'info' | 'success' | 'warning' | 'error'
> = {
  PLANNED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'default',
  NO_SHOW: 'warning',
};

export const VISIT_OUTCOMES: VisitOutcome[] = [
  'INTERESTED',
  'NOT_INTERESTED',
  'FOLLOW_UP_NEEDED',
  'QUOTATION_REQUESTED',
  'ORDER_DISCUSSED',
];

export const VISIT_OUTCOME_LABELS: Record<VisitOutcome, string> = {
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  FOLLOW_UP_NEEDED: 'Follow-up needed',
  QUOTATION_REQUESTED: 'Quotation requested',
  ORDER_DISCUSSED: 'Order discussed',
};
