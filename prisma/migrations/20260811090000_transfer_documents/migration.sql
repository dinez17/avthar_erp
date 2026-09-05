-- Stock transfers gain the paper that travels with the goods, and a two-leg lifecycle.
--
-- Until now a transfer posted both movement legs at once, so stock jumped from one
-- godown to the other with nothing in between. Goods on a lorry are neither place, and
-- a lorry can arrive short — so the transfer now dispatches (OUT) and is received (IN)
-- separately, with the shortfall visible.

CREATE TYPE "TransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');
CREATE TYPE "TransferDocumentType" AS ENUM ('DELIVERY_CHALLAN', 'TAX_INVOICE');

ALTER TABLE "stock_transfers"
  ADD COLUMN "status"        "TransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
  ADD COLUMN "documentType"  "TransferDocumentType" NOT NULL DEFAULT 'DELIVERY_CHALLAN',
  ADD COLUMN "documentNo"    TEXT,
  ADD COLUMN "fromGstin"     TEXT,
  ADD COLUMN "toGstin"       TEXT,
  ADD COLUMN "interState"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "subTotal"      DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cgstAmount"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sgstAmount"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "igstAmount"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "gstAmount"     DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "grandTotal"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "transporterId" UUID,
  ADD COLUMN "vehicleId"     UUID,
  ADD COLUMN "driverId"      UUID,
  ADD COLUMN "lrNumber"      TEXT,
  ADD COLUMN "freightCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "distanceKm"    INTEGER,
  ADD COLUMN "ewayBillNo"    TEXT,
  ADD COLUMN "ewayBillDate"  TIMESTAMP(3),
  ADD COLUMN "receivedAt"     TIMESTAMP(3),
  ADD COLUMN "receivedBy"     UUID,
  ADD COLUMN "receivedByName" TEXT,
  ADD COLUMN "receiptRemarks" TEXT,
  ADD COLUMN "cancelledAt"  TIMESTAMP(3),
  ADD COLUMN "cancelledBy"  UUID,
  ADD COLUMN "cancelReason" TEXT;

ALTER TABLE "stock_transfer_lines"
  ADD COLUMN "qtyReceived"  DECIMAL(14,3),
  ADD COLUMN "rate"         DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "gstRate"      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN "lineSubTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "lineGst"      DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "lineTotal"    DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Existing transfers already posted both legs, so the goods are at the destination:
-- they are received, in full, and their document number is the transfer number.
UPDATE "stock_transfers"
   SET "status"     = 'RECEIVED',
       "documentNo" = "transferNo",
       "receivedAt" = "transferDate";

UPDATE "stock_transfer_lines"
   SET "qtyReceived" = "qtyBoxes";

ALTER TABLE "stock_transfers" ALTER COLUMN "documentNo" SET NOT NULL;

CREATE UNIQUE INDEX "stock_transfers_documentNo_key" ON "stock_transfers"("documentNo");
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");

ALTER TABLE "stock_transfers"
  ADD CONSTRAINT "stock_transfers_transporterId_fkey"
  FOREIGN KEY ("transporterId") REFERENCES "transporters"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_transfers_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_transfers_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
