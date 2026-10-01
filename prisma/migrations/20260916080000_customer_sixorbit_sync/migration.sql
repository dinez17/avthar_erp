ALTER TABLE "customers"
  ADD COLUMN "sixorbitId" TEXT,
  ADD COLUMN "sixorbitAlid" TEXT,
  ADD COLUMN "sixorbitCustomerNumber" TEXT,
  ADD COLUMN "sixorbitCustomerCode" TEXT,
  ADD COLUMN "sixorbitSyncStatus" "ProductSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
  ADD COLUMN "sixorbitSyncedAt" TIMESTAMP(3),
  ADD COLUMN "sixorbitSyncError" TEXT,
  ADD COLUMN "sixorbitRaw" JSONB;

CREATE UNIQUE INDEX "customers_sixorbitId_key" ON "customers"("sixorbitId");
