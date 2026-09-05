-- Handing the day's takings to an owner, and keeping a float to open with.
--
-- At close the drawer holds, say, 1,02,500. The branch keeps 2,500 to make change with
-- tomorrow and 1,00,000 goes to an owner. That is a movement of money, not a disappearance:
-- the owner is holding it and the company still owns it, so it lands in an account of its
-- own where the balance says who has what.
--
-- OWNER is its own account type rather than another CASH row. Money with an owner is not
-- in a till, and letting it sit inside "cash in the branches" would make that figure a
-- number nobody could act on.

ALTER TYPE "LedgerAccountType" ADD VALUE 'OWNER';

ALTER TABLE "ledger_accounts"
  ADD COLUMN "retainedFloat" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "cash_counts"
  ADD COLUMN "handoverAmount"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "handoverAccountId" UUID,
  ADD COLUMN "handoverEntryId"   UUID,
  ADD COLUMN "retainedAmount"    DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Closes made before this migration handed over nothing and kept the whole count.
UPDATE "cash_counts" SET "retainedAmount" = "countedAmount";

ALTER TABLE "cash_counts"
  ADD CONSTRAINT "cash_counts_handoverAccountId_fkey"
  FOREIGN KEY ("handoverAccountId") REFERENCES "ledger_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "cash_counts_handoverEntryId_key" ON "cash_counts"("handoverEntryId");
CREATE INDEX "cash_counts_handoverAccountId_idx" ON "cash_counts"("handoverAccountId");
