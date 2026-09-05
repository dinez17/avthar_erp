-- CRM leads: the pipeline that feeds the quotation desk.
--
-- A lead is a prospect being worked towards a quotation. It carries the five things the
-- board is run on — source, stage, owner, expected value and the next follow-up — plus a
-- contact to reach the person by.
--
-- The reference columns (customer, branch, owner, converted quotation) are plain ids with
-- a name snapshot beside them, exactly as a quotation carries its salesman and customer.
-- No foreign keys are declared: the lead reads as itself in history after a master record
-- is edited or removed, and CRM owns no keys into records another module manages. The
-- convertedQuotationId is unique so a lead can only ever be converted once.

CREATE TYPE "LeadSource" AS ENUM (
  'WALK_IN',
  'PHONE',
  'REFERRAL',
  'WEBSITE',
  'EXHIBITION',
  'SOCIAL_MEDIA',
  'ADVERTISEMENT',
  'OTHER'
);

CREATE TYPE "LeadStage" AS ENUM (
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'QUOTED',
  'WON',
  'LOST'
);

CREATE TABLE "leads" (
  "id"                   UUID NOT NULL,
  "code"                 TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "companyName"          TEXT,
  "phone"                TEXT,
  "altPhone"             TEXT,
  "email"                TEXT,
  "city"                 TEXT,
  "source"               "LeadSource" NOT NULL DEFAULT 'WALK_IN',
  "stage"                "LeadStage" NOT NULL DEFAULT 'NEW',
  "ownerUserId"          UUID,
  "ownerName"            TEXT,
  "expectedValue"        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "nextFollowUpAt"       TIMESTAMP(3),
  "customerId"           UUID,
  "branchId"             UUID,
  "convertedQuotationId" UUID,
  "convertedAt"          TIMESTAMP(3),
  "lostReason"           TEXT,
  "notes"                TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"           UUID,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  "updatedBy"           UUID,
  "deletedAt"           TIMESTAMP(3),
  "deletedBy"           UUID,
  "version"             INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leads_code_key" ON "leads"("code");
CREATE UNIQUE INDEX "leads_convertedQuotationId_key" ON "leads"("convertedQuotationId");
CREATE INDEX "leads_deletedAt_idx" ON "leads"("deletedAt");
CREATE INDEX "leads_stage_idx" ON "leads"("stage");
CREATE INDEX "leads_ownerUserId_idx" ON "leads"("ownerUserId");
CREATE INDEX "leads_nextFollowUpAt_idx" ON "leads"("nextFollowUpAt");
CREATE INDEX "leads_phone_idx" ON "leads"("phone");
