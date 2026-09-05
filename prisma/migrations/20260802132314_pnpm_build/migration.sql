-- AlterTable
ALTER TABLE "products" ADD COLUMN     "additionalRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "landingCost" DECIMAL(12,2),
ADD COLUMN     "purchaseRate" DECIMAL(12,2),
ADD COLUMN     "transportRate" DECIMAL(12,2) NOT NULL DEFAULT 0;
