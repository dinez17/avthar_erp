-- CreateEnum
CREATE TYPE "ReceiptMode" AS ENUM ('CASH', 'BANK', 'UPI', 'CHEQUE', 'CARD');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "customer_receipts" (
    "id" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" "ReceiptMode" NOT NULL DEFAULT 'CASH',
    "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "referenceNo" TEXT,
    "bankName" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "allocatedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedBy" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" UUID,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "customer_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_receipt_allocations" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "salesInvoiceId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "customer_receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_receipts_receiptNumber_key" ON "customer_receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "customer_receipts_customerId_idx" ON "customer_receipts"("customerId");

-- CreateIndex
CREATE INDEX "customer_receipts_branchId_idx" ON "customer_receipts"("branchId");

-- CreateIndex
CREATE INDEX "customer_receipts_status_idx" ON "customer_receipts"("status");

-- CreateIndex
CREATE INDEX "customer_receipts_receiptDate_idx" ON "customer_receipts"("receiptDate");

-- CreateIndex
CREATE INDEX "customer_receipt_allocations_receiptId_idx" ON "customer_receipt_allocations"("receiptId");

-- CreateIndex
CREATE INDEX "customer_receipt_allocations_salesInvoiceId_idx" ON "customer_receipt_allocations"("salesInvoiceId");

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "customer_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
