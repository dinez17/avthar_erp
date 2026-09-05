-- Cash and bank: one append-only book.
--
-- Every rupee that moves is a row here, and an account's balance is its opening plus the
-- rows since. The balance is never stored, for the same reason stock balances are a
-- projection: a stored figure and a ledger disagree eventually, and the ledger is the one
-- that can be audited.

CREATE TYPE "LedgerAccountType" AS ENUM ('CASH', 'BANK');
CREATE TYPE "CashEntryType" AS ENUM ('RECEIPT', 'PAYMENT', 'EXPENSE', 'TRANSFER');
CREATE TYPE "CashEntryDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "CashEntrySource" AS ENUM (
  'MANUAL',
  'CUSTOMER_RECEIPT',
  'SUPPLIER_PAYMENT',
  'DRIVER_CASH'
);

ALTER TYPE "DocumentType" ADD VALUE 'CASH_ENTRY';
ALTER TYPE "DocumentType" ADD VALUE 'EXPENSE';

CREATE TABLE "ledger_accounts" (
  "id"             UUID NOT NULL,
  "code"           TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "type"           "LedgerAccountType" NOT NULL,
  "branchId"       UUID,
  "bankName"       TEXT,
  "accountNumber"  TEXT,
  "ifsc"           TEXT,
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "openingDate"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"      UUID,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "updatedBy"      UUID,
  "deletedAt"      TIMESTAMP(3),
  "deletedBy"      UUID,
  "version"        INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");
CREATE INDEX "ledger_accounts_branchId_idx" ON "ledger_accounts"("branchId");
CREATE INDEX "ledger_accounts_type_idx" ON "ledger_accounts"("type");
CREATE INDEX "ledger_accounts_deletedAt_idx" ON "ledger_accounts"("deletedAt");

CREATE TABLE "expense_heads" (
  "id"        UUID NOT NULL,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" UUID,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" UUID,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" UUID,
  "version"   INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "expense_heads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_heads_code_key" ON "expense_heads"("code");
CREATE INDEX "expense_heads_deletedAt_idx" ON "expense_heads"("deletedAt");

-- A transfer writes two rows, one OUT and one IN, pointing at each other. Two rows rather
-- than one with a sign, because each account's book has to read correctly on its own.
CREATE TABLE "cash_entries" (
  "id"               UUID NOT NULL,
  "entryNumber"      TEXT NOT NULL,
  "accountId"        UUID NOT NULL,
  "branchId"         UUID,
  "entryDate"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "type"             "CashEntryType" NOT NULL,
  "direction"        "CashEntryDirection" NOT NULL,
  "amount"           DECIMAL(14,2) NOT NULL,
  "expenseHeadId"    UUID,
  "counterAccountId" UUID,
  "pairedEntryId"    UUID,
  "source"           "CashEntrySource" NOT NULL DEFAULT 'MANUAL',
  "refType"          TEXT,
  "refId"            UUID,
  "refNumber"        TEXT,
  "referenceNo"      TEXT,
  "narration"        TEXT,
  "reversedAt"       TIMESTAMP(3),
  "reversedBy"       UUID,
  "reversalReason"   TEXT,
  "reversalEntryId"  UUID,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"        UUID,
  CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_entries_entryNumber_key" ON "cash_entries"("entryNumber");
CREATE UNIQUE INDEX "cash_entries_pairedEntryId_key" ON "cash_entries"("pairedEntryId");
CREATE UNIQUE INDEX "cash_entries_reversalEntryId_key" ON "cash_entries"("reversalEntryId");
CREATE INDEX "cash_entries_accountId_entryDate_idx" ON "cash_entries"("accountId", "entryDate");
CREATE INDEX "cash_entries_branchId_idx" ON "cash_entries"("branchId");
CREATE INDEX "cash_entries_type_idx" ON "cash_entries"("type");
CREATE INDEX "cash_entries_expenseHeadId_idx" ON "cash_entries"("expenseHeadId");
CREATE INDEX "cash_entries_ref_idx" ON "cash_entries"("refType", "refId");

ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "ledger_accounts_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_entries"
  ADD CONSTRAINT "cash_entries_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cash_entries_counterAccountId_fkey"
  FOREIGN KEY ("counterAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cash_entries_expenseHeadId_fkey"
  FOREIGN KEY ("expenseHeadId") REFERENCES "expense_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cash_entries_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
