ALTER TABLE "sales_orders"
  ADD COLUMN "sixorbitId" TEXT,
  ADD COLUMN "sixorbitOrderId" TEXT,
  ADD COLUMN "sixorbitSyncStatus" "ProductSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
  ADD COLUMN "sixorbitSyncedAt" TIMESTAMP(3),
  ADD COLUMN "sixorbitSyncError" TEXT,
  ADD COLUMN "sixorbitRaw" JSONB;

CREATE UNIQUE INDEX "sales_orders_sixorbitId_key" ON "sales_orders"("sixorbitId");
