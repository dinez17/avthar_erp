/*
  Warnings:

  - You are about to drop the column `bankName` on the `customer_receipts` table. All the data in the column will be lost.
  - You are about to drop the column `referenceNo` on the `customer_receipts` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "ReceiptMode" ADD VALUE 'MIXED';

-- AlterTable
ALTER TABLE "customer_receipts" DROP COLUMN "bankName",
DROP COLUMN "referenceNo";

-- CreateTable
CREATE TABLE "customer_receipt_payments" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "mode" "ReceiptMode" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "referenceNo" TEXT,
    "bankName" TEXT,

    CONSTRAINT "customer_receipt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_receipt_payments_receiptId_idx" ON "customer_receipt_payments"("receiptId");

-- AddForeignKey
ALTER TABLE "customer_receipt_payments" ADD CONSTRAINT "customer_receipt_payments_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
