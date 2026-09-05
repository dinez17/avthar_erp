-- Closing the trip: the odometer read at the gate on the way out and back, what each
-- drop actually settled, and the cash counted off the driver.

-- AlterEnum
ALTER TYPE "GatePassStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "gate_passes" ADD COLUMN     "startKm" INTEGER,
ADD COLUMN     "endKm" INTEGER,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedBy" UUID,
ADD COLUMN     "cashHandedOver" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "closeRemarks" TEXT;

-- AlterTable
ALTER TABLE "gate_pass_documents" ADD COLUMN     "freightPaidAtBranch" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "freightCollected" DECIMAL(12,2) NOT NULL DEFAULT 0;
