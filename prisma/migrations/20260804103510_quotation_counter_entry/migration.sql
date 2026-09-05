/*
  Warnings:

  - Added the required column `customerName` to the `quotations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "quotation_lines" ADD COLUMN     "boxes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mrp" DECIMAL(12,2),
ADD COLUMN     "pieces" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerMobile" TEXT,
ADD COLUMN     "customerName" TEXT NOT NULL,
ADD COLUMN     "freightCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loadingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "roundOff" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN     "salesmanName" TEXT,
ADD COLUMN     "unloadingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "customerId" DROP NOT NULL;
