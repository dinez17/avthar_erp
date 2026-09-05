-- Payables: money going out to suppliers.
--
-- The mirror of collections, with one addition. A customer settles with money only; a
-- supplier account is also settled by debit notes, because goods sent back are credit
-- with them. So a payment carries tenders (cash that left) and set-offs (credit that was
-- used), and the two together are what it can allocate to bills.

ALTER TABLE "purchase_invoices"
  ADD COLUMN "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "purchase_returns"
  ADD COLUMN "adjustedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "supplier_payments" (
  "id"              UUID NOT NULL,
  "paymentNumber"   TEXT NOT NULL,
  "supplierId"      UUID NOT NULL,
  "branchId"        UUID NOT NULL,
  "paymentDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mode"            "ReceiptMode" NOT NULL DEFAULT 'BANK',
  "status"          "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
  "amount"          DECIMAL(14,2) NOT NULL DEFAULT 0,
  "adjustedAmount"  DECIMAL(14,2) NOT NULL DEFAULT 0,
  "allocatedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remarks"         TEXT,
  "postedAt"        TIMESTAMP(3),
  "postedBy"        UUID,
  "cancelledAt"     TIMESTAMP(3),
  "cancelledBy"     UUID,
  "cancelReason"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       UUID,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "updatedBy"       UUID,
  "deletedAt"       TIMESTAMP(3),
  "version"         INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_payments_paymentNumber_key" ON "supplier_payments"("paymentNumber");
CREATE INDEX "supplier_payments_supplierId_idx" ON "supplier_payments"("supplierId");
CREATE INDEX "supplier_payments_branchId_idx" ON "supplier_payments"("branchId");
CREATE INDEX "supplier_payments_status_idx" ON "supplier_payments"("status");
CREATE INDEX "supplier_payments_paymentDate_idx" ON "supplier_payments"("paymentDate");

CREATE TABLE "supplier_payment_tenders" (
  "id"          UUID NOT NULL,
  "paymentId"   UUID NOT NULL,
  "mode"        "ReceiptMode" NOT NULL,
  "amount"      DECIMAL(14,2) NOT NULL,
  "referenceNo" TEXT,
  "bankName"    TEXT,
  CONSTRAINT "supplier_payment_tenders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_payment_tenders_paymentId_idx" ON "supplier_payment_tenders"("paymentId");

CREATE TABLE "supplier_payment_allocations" (
  "id"                UUID NOT NULL,
  "paymentId"         UUID NOT NULL,
  "purchaseInvoiceId" UUID NOT NULL,
  "amount"            DECIMAL(14,2) NOT NULL,
  CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_payment_allocations_paymentId_idx" ON "supplier_payment_allocations"("paymentId");
CREATE INDEX "supplier_payment_allocations_purchaseInvoiceId_idx" ON "supplier_payment_allocations"("purchaseInvoiceId");

CREATE TABLE "supplier_payment_debit_notes" (
  "id"               UUID NOT NULL,
  "paymentId"        UUID NOT NULL,
  "purchaseReturnId" UUID NOT NULL,
  "amount"           DECIMAL(14,2) NOT NULL,
  CONSTRAINT "supplier_payment_debit_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_payment_debit_notes_paymentId_idx" ON "supplier_payment_debit_notes"("paymentId");
CREATE INDEX "supplier_payment_debit_notes_purchaseReturnId_idx" ON "supplier_payment_debit_notes"("purchaseReturnId");

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "supplier_payments_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_tenders"
  ADD CONSTRAINT "supplier_payment_tenders_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_allocations"
  ADD CONSTRAINT "supplier_payment_allocations_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "supplier_payment_allocations_purchaseInvoiceId_fkey"
  FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_debit_notes"
  ADD CONSTRAINT "supplier_payment_debit_notes_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "supplier_payment_debit_notes_purchaseReturnId_fkey"
  FOREIGN KEY ("purchaseReturnId") REFERENCES "purchase_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
