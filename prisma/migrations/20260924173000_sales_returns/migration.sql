ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SALES_RETURN';
ALTER TABLE "sales_invoices" ADD COLUMN "returnedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "sales_returns" (
  "id" UUID NOT NULL, "returnNumber" TEXT NOT NULL, "salesInvoiceId" UUID NOT NULL,
  "customerId" UUID NOT NULL, "branchId" UUID NOT NULL,
  "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL, "remarks" TEXT,
  "subTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" UUID,
  CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "sales_return_lines" (
  "id" UUID NOT NULL, "salesReturnId" UUID NOT NULL, "salesInvoiceLineId" UUID NOT NULL,
  "productId" UUID NOT NULL, "godownId" UUID NOT NULL,
  "boxes" INTEGER NOT NULL DEFAULT 0, "pieces" INTEGER NOT NULL DEFAULT 0,
  "qtyBoxes" DECIMAL(14,3) NOT NULL, "rate" DECIMAL(14,8) NOT NULL,
  "gstRate" DECIMAL(5,2) NOT NULL, "lineSubTotal" DECIMAL(14,2) NOT NULL,
  "lineGst" DECIMAL(14,2) NOT NULL, "lineTotal" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "sales_return_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sales_returns_returnNumber_key" ON "sales_returns"("returnNumber");
CREATE INDEX "sales_returns_salesInvoiceId_idx" ON "sales_returns"("salesInvoiceId");
CREATE INDEX "sales_returns_customerId_returnDate_idx" ON "sales_returns"("customerId", "returnDate");
CREATE INDEX "sales_returns_branchId_returnDate_idx" ON "sales_returns"("branchId", "returnDate");
CREATE INDEX "sales_return_lines_salesReturnId_idx" ON "sales_return_lines"("salesReturnId");
CREATE INDEX "sales_return_lines_salesInvoiceLineId_idx" ON "sales_return_lines"("salesInvoiceLineId");
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_salesInvoiceLineId_fkey" FOREIGN KEY ("salesInvoiceLineId") REFERENCES "sales_invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
