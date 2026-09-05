-- AlterEnum
-- A sample gate pass has no invoice behind it, so the pass is itself the stock movement.
ALTER TYPE "MovementType" ADD VALUE 'SAMPLE_OUT';
ALTER TYPE "MovementType" ADD VALUE 'SAMPLE_IN';

-- CreateEnum
CREATE TYPE "GatePassType" AS ENUM ('SALES', 'TRANSFER', 'SAMPLE');

-- CreateEnum
CREATE TYPE "GatePassStatus" AS ENUM ('DRAFT', 'LOADED', 'GATED_OUT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'PARTIAL', 'DISPATCHED');

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "dispatchStatus" "DispatchStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "sales_invoice_lines" ADD COLUMN     "dispatchedQtyBoxes" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "gate_passes" (
    "id" UUID NOT NULL,
    "gatePassNo" TEXT NOT NULL,
    "type" "GatePassType" NOT NULL,
    "status" "GatePassStatus" NOT NULL DEFAULT 'DRAFT',
    "branchId" UUID NOT NULL,
    "gateId" UUID,
    "passDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" UUID,
    "toBranchId" UUID,
    "destination" TEXT,
    "transporterId" UUID,
    "vehicleId" UUID,
    "driverId" UUID,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "transporterName" TEXT,
    "hireCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advancePaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billedFreight" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnable" BOOLEAN NOT NULL DEFAULT false,
    "expectedReturnDate" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnedBy" UUID,
    "loadedAt" TIMESTAMP(3),
    "loadedBy" UUID,
    "gatedOutAt" TIMESTAMP(3),
    "gatedOutBy" UUID,
    "deliveredAt" TIMESTAMP(3),
    "deliveredBy" UUID,
    "receivedByName" TEXT,
    "receivedByPhone" TEXT,
    "podRemarks" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" UUID,
    "cancelReason" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_pass_documents" (
    "id" UUID NOT NULL,
    "gatePassId" UUID NOT NULL,
    "salesInvoiceId" UUID,
    "stockTransferId" UUID,
    "documentNumber" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "documentValue" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "gate_pass_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_pass_lines" (
    "id" UUID NOT NULL,
    "gatePassId" UUID NOT NULL,
    "documentId" UUID,
    "productId" UUID NOT NULL,
    "godownId" UUID NOT NULL,
    "gateId" UUID,
    "batchNo" TEXT,
    "shade" TEXT,
    "docQtyBoxes" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "boxes" INTEGER NOT NULL DEFAULT 0,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "qtyBoxes" DECIMAL(14,3) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "gate_pass_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gate_passes_gatePassNo_key" ON "gate_passes"("gatePassNo");

-- CreateIndex
CREATE INDEX "gate_passes_branchId_idx" ON "gate_passes"("branchId");

-- CreateIndex
CREATE INDEX "gate_passes_customerId_idx" ON "gate_passes"("customerId");

-- CreateIndex
CREATE INDEX "gate_passes_status_idx" ON "gate_passes"("status");

-- CreateIndex
CREATE INDEX "gate_passes_passDate_idx" ON "gate_passes"("passDate");

-- CreateIndex
CREATE INDEX "gate_passes_deletedAt_idx" ON "gate_passes"("deletedAt");

-- CreateIndex
CREATE INDEX "gate_pass_documents_gatePassId_idx" ON "gate_pass_documents"("gatePassId");

-- CreateIndex
CREATE INDEX "gate_pass_documents_salesInvoiceId_idx" ON "gate_pass_documents"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "gate_pass_documents_stockTransferId_idx" ON "gate_pass_documents"("stockTransferId");

-- CreateIndex
CREATE INDEX "gate_pass_lines_gatePassId_idx" ON "gate_pass_lines"("gatePassId");

-- CreateIndex
CREATE INDEX "gate_pass_lines_documentId_idx" ON "gate_pass_lines"("documentId");

-- CreateIndex
CREATE INDEX "gate_pass_lines_productId_idx" ON "gate_pass_lines"("productId");

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "transporters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_documents" ADD CONSTRAINT "gate_pass_documents_gatePassId_fkey" FOREIGN KEY ("gatePassId") REFERENCES "gate_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_documents" ADD CONSTRAINT "gate_pass_documents_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_documents" ADD CONSTRAINT "gate_pass_documents_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "stock_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_lines" ADD CONSTRAINT "gate_pass_lines_gatePassId_fkey" FOREIGN KEY ("gatePassId") REFERENCES "gate_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_lines" ADD CONSTRAINT "gate_pass_lines_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "gate_pass_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_lines" ADD CONSTRAINT "gate_pass_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_lines" ADD CONSTRAINT "gate_pass_lines_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "godowns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
