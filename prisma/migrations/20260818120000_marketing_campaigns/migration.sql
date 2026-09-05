-- Marketing campaigns, and the lead attribution that feeds their return.
--
-- A campaign carries a budget; the performance report sets that against the leads it
-- brought in and how many converted, dividing to a cost per lead and a return. Value uses
-- the lead's own expected value — the figure the pipeline board already weights on — so
-- marketing and sales read one number rather than two.
--
-- Attribution is a nullable link on the lead: leads without a campaign stay exactly as they
-- are, and deleting a campaign nulls the link rather than the lead.

CREATE TYPE "CampaignChannel" AS ENUM (
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
  'OTHER'
);

CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "campaigns" (
  "id"        UUID NOT NULL,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "channel"   "CampaignChannel" NOT NULL,
  "status"    "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "budget"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMP(3),
  "endDate"   TIMESTAMP(3),
  "objective" TEXT,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" UUID,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" UUID,
  "version"   INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaigns_code_key" ON "campaigns"("code");
CREATE INDEX "campaigns_deletedAt_idx" ON "campaigns"("deletedAt");
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");
CREATE INDEX "campaigns_channel_idx" ON "campaigns"("channel");

ALTER TABLE "leads" ADD COLUMN "campaignId" UUID;
CREATE INDEX "leads_campaignId_idx" ON "leads"("campaignId");

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
