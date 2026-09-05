-- Telecalling: calls logged against a lead.
--
-- A call carries who made it, how it ended (disposition), how long it ran, and — on a
-- callback — when to ring again. Logging a call can move the lead's follow-up date and
-- stage, but that consequence is written onto the lead; this table only records the call.
--
-- Calls cascade-delete with their lead and are soft-deleted individually, so a mislogged
-- call is withdrawn rather than rewritten.

CREATE TYPE "CallDirection" AS ENUM ('OUTBOUND', 'INBOUND');

CREATE TYPE "CallDisposition" AS ENUM (
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'SWITCHED_OFF',
  'WRONG_NUMBER',
  'CALLBACK',
  'INTERESTED',
  'NOT_INTERESTED'
);

CREATE TABLE "call_logs" (
  "id"           UUID NOT NULL,
  "leadId"       UUID NOT NULL,
  "callerUserId" UUID,
  "callerName"   TEXT,
  "direction"    "CallDirection" NOT NULL DEFAULT 'OUTBOUND',
  "disposition"  "CallDisposition" NOT NULL,
  "durationSec"  INTEGER,
  "calledAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "callbackAt"   TIMESTAMP(3),
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"    UUID,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "updatedBy"    UUID,
  "deletedAt"    TIMESTAMP(3),
  "deletedBy"    UUID,
  "version"      INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "call_logs_deletedAt_idx" ON "call_logs"("deletedAt");
CREATE INDEX "call_logs_leadId_idx" ON "call_logs"("leadId");
CREATE INDEX "call_logs_callerUserId_idx" ON "call_logs"("callerUserId");
CREATE INDEX "call_logs_disposition_idx" ON "call_logs"("disposition");
CREATE INDEX "call_logs_callbackAt_idx" ON "call_logs"("callbackAt");

ALTER TABLE "call_logs"
  ADD CONSTRAINT "call_logs_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
