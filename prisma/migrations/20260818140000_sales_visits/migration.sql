-- Sales visits: field visits scheduled and reported against a lead.
--
-- A visit has a lifecycle — planned, then completed (or cancelled / a no-show). Like a
-- call, reporting it can move the lead's follow-up date and stage: a planned visit becomes
-- the lead's next action, a completed one carries the next-action date agreed on site, and
-- a "not interested" outcome closes the lead. Those consequences are written onto the lead;
-- this table records the visit. Visits cascade-delete with their lead and are soft-deleted
-- individually.

CREATE TYPE "VisitPurpose" AS ENUM (
  'INTRODUCTION',
  'PRODUCT_DEMO',
  'QUOTATION_DISCUSSION',
  'NEGOTIATION',
  'SITE_MEASUREMENT',
  'PAYMENT_FOLLOWUP',
  'RELATIONSHIP',
  'OTHER'
);

CREATE TYPE "VisitStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

CREATE TYPE "VisitOutcome" AS ENUM (
  'INTERESTED',
  'NOT_INTERESTED',
  'FOLLOW_UP_NEEDED',
  'QUOTATION_REQUESTED',
  'ORDER_DISCUSSED'
);

CREATE TABLE "sales_visits" (
  "id"                UUID NOT NULL,
  "leadId"            UUID NOT NULL,
  "salespersonUserId" UUID,
  "salespersonName"   TEXT,
  "purpose"           "VisitPurpose" NOT NULL DEFAULT 'INTRODUCTION',
  "status"            "VisitStatus" NOT NULL DEFAULT 'PLANNED',
  "outcome"           "VisitOutcome",
  "scheduledAt"       TIMESTAMP(3) NOT NULL,
  "completedAt"       TIMESTAMP(3),
  "location"          TEXT,
  "notes"             TEXT,
  "nextFollowUpAt"    TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"         UUID,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "updatedBy"         UUID,
  "deletedAt"         TIMESTAMP(3),
  "deletedBy"         UUID,
  "version"           INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "sales_visits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_visits_deletedAt_idx" ON "sales_visits"("deletedAt");
CREATE INDEX "sales_visits_leadId_idx" ON "sales_visits"("leadId");
CREATE INDEX "sales_visits_salespersonUserId_idx" ON "sales_visits"("salespersonUserId");
CREATE INDEX "sales_visits_status_idx" ON "sales_visits"("status");
CREATE INDEX "sales_visits_scheduledAt_idx" ON "sales_visits"("scheduledAt");

ALTER TABLE "sales_visits"
  ADD CONSTRAINT "sales_visits_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
