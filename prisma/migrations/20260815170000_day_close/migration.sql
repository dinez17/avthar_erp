-- Day close: counting an account against what the book says it should hold.
--
-- A cash book nobody counts is a guess. Closing a day freezes what the book said, records
-- what was actually in the drawer, and locks the day so nothing can be slipped in behind
-- the count.

ALTER TYPE "CashEntryType" ADD VALUE 'ADJUSTMENT';
ALTER TYPE "CashEntrySource" ADD VALUE 'CASH_COUNT';

-- Driver handovers land in a drawer. The counter has counted the notes once already;
-- naming the account saves counting them into the book a second time.
ALTER TABLE "driver_cash_handovers" ADD COLUMN "accountId" UUID;

ALTER TABLE "driver_cash_handovers"
  ADD CONSTRAINT "driver_cash_handovers_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "driver_cash_handovers_accountId_idx" ON "driver_cash_handovers"("accountId");

CREATE TABLE "cash_counts" (
  "id"                UUID NOT NULL,
  "countNo"           TEXT NOT NULL,
  "accountId"         UUID NOT NULL,
  "branchId"          UUID,
  "closeDate"         DATE NOT NULL,
  "expectedBalance"   DECIMAL(14,2) NOT NULL,
  "countedAmount"     DECIMAL(14,2) NOT NULL,
  "variance"          DECIMAL(14,2) NOT NULL,
  "denominations"     JSONB,
  "adjustmentEntryId" UUID,
  "notes"             TEXT,
  "reopenedAt"        TIMESTAMP(3),
  "reopenedBy"        UUID,
  "reopenReason"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"         UUID,

  CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_counts_countNo_key" ON "cash_counts"("countNo");
CREATE UNIQUE INDEX "cash_counts_adjustmentEntryId_key" ON "cash_counts"("adjustmentEntryId");
CREATE INDEX "cash_counts_accountId_closeDate_idx" ON "cash_counts"("accountId", "closeDate");
CREATE INDEX "cash_counts_branchId_idx" ON "cash_counts"("branchId");
CREATE INDEX "cash_counts_closeDate_idx" ON "cash_counts"("closeDate");

-- "One live close per account per day" is enforced in the repository, inside the closing
-- transaction, rather than by a unique index. It cannot be a plain unique index: reopening
-- leaves the old row in place rather than deleting it, so a day legitimately carries a
-- reopened close and a fresh one. A partial index WHERE "reopenedAt" IS NULL would express
-- it exactly, but Prisma has no syntax for partial uniques, so it would read as drift and
-- the next `prisma migrate dev` would offer to drop it. A guarantee that disappears
-- quietly is worse than one written where it can be read.

ALTER TABLE "cash_counts"
  ADD CONSTRAINT "cash_counts_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_counts"
  ADD CONSTRAINT "cash_counts_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
