-- Branch-wise document numbering.
--
-- Two tables on purpose. The prefix is a setting a person edits; the counter is machine
-- state that must never be casually changed, because moving it backwards mints a
-- duplicate invoice number and there is no tidy way to unmake one.
--
-- Nothing is seeded. A series with no setting falls back to the prefix the code used
-- before, so every document keeps numbering exactly as it does today until a branch is
-- given one of its own.

CREATE TYPE "DocumentType" AS ENUM (
  'QUOTATION',
  'SALES_ORDER',
  'SALES_INVOICE',
  'RECEIPT',
  'PURCHASE_ORDER',
  'GOODS_RECEIPT',
  'PURCHASE_INVOICE',
  'PURCHASE_RETURN',
  'SUPPLIER_PAYMENT',
  'STOCK_TRANSFER',
  'TRANSFER_CHALLAN',
  'TRANSFER_INVOICE',
  'GATE_PASS',
  'DRIVER_CASH_HANDOVER',
  'TRANSPORTER',
  'DRIVER'
);

CREATE TABLE "number_series_settings" (
  "id"            UUID NOT NULL,
  "documentType"  "DocumentType" NOT NULL,
  "branchId"      UUID,
  "prefix"        TEXT NOT NULL,
  "separator"     TEXT NOT NULL DEFAULT '/',
  "padding"       INTEGER NOT NULL DEFAULT 4,
  "resetAnnually" BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"     UUID,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "updatedBy"     UUID,
  "version"       INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "number_series_settings_pkey" PRIMARY KEY ("id")
);

-- A partial unique index as well as the composite one: NULL never equals NULL in SQL, so
-- without this two company-wide series for the same document type could both be created.
CREATE UNIQUE INDEX "number_series_settings_key"
  ON "number_series_settings"("documentType", "branchId");
CREATE UNIQUE INDEX "number_series_settings_company_key"
  ON "number_series_settings"("documentType") WHERE "branchId" IS NULL;

ALTER TABLE "number_series_settings"
  ADD CONSTRAINT "number_series_settings_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- scope and financialYear are empty strings rather than NULLs, and there is no foreign
-- key on the branch. Both deliberate: a unique index does not treat two NULLs as equal,
-- so a nullable key would let two rows exist for the same counter and quietly issue the
-- same number twice. An empty string is equal to itself.
CREATE TABLE "number_sequences" (
  "id"            UUID NOT NULL,
  "documentType"  "DocumentType" NOT NULL,
  "scope"         TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "lastNumber"    INTEGER NOT NULL DEFAULT 0,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "number_sequences_key"
  ON "number_sequences"("documentType", "scope", "financialYear");
