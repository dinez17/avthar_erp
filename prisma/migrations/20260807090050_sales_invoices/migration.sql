-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "salesOrderId" UUID,
    "customerId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "customerMobile" TEXT,
    "customerGstin" TEXT,
    "placeOfSupply" TEXT,
    "salesmanUserId" UUID,
    "salesmanName" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freightCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unloadingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loadingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
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

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" UUID NOT NULL,
    "salesInvoiceId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "salesOrderLineId" UUID,
    "godownId" UUID NOT NULL,
    "gateId" UUID,
    "batchNo" TEXT,
    "shade" TEXT,
    "hsnCode" TEXT,
    "boxes" INTEGER NOT NULL DEFAULT 0,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "qtyBoxes" DECIMAL(14,3) NOT NULL,
    "mrp" DECIMAL(12,2),
    "rate" DECIMAL(12,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "lineSubTotal" DECIMAL(14,2) NOT NULL,
    "lineCgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineSgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineIgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineGst" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_invoiceNumber_key" ON "sales_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "sales_invoices_customerId_idx" ON "sales_invoices"("customerId");

-- CreateIndex
CREATE INDEX "sales_invoices_branchId_idx" ON "sales_invoices"("branchId");

-- CreateIndex
CREATE INDEX "sales_invoices_salesOrderId_idx" ON "sales_invoices"("salesOrderId");

-- CreateIndex
CREATE INDEX "sales_invoices_status_idx" ON "sales_invoices"("status");

-- CreateIndex
CREATE INDEX "sales_invoices_invoiceDate_idx" ON "sales_invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_salesInvoiceId_idx" ON "sales_invoice_lines"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_productId_idx" ON "sales_invoice_lines"("productId");

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
