ALTER TYPE "SixOrbitEntityType" ADD VALUE IF NOT EXISTS 'SALES_INVOICE';

ALTER TABLE "sales_invoices"
  ADD COLUMN "sixorbitId" TEXT,
  ADD COLUMN "sixorbitOrderId" TEXT,
  ADD COLUMN "sixorbitSyncStatus" "ProductSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
  ADD COLUMN "sixorbitSyncedAt" TIMESTAMP(3),
  ADD COLUMN "sixorbitSyncError" TEXT,
  ADD COLUMN "sixorbitRaw" JSONB;

CREATE UNIQUE INDEX "sales_invoices_sixorbitId_key" ON "sales_invoices"("sixorbitId");
