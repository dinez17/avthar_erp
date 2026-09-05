-- Credit exceptions become a request, not a dead end.
--
-- The check used to refuse the document and tell the salesperson to find an approver, who
-- then had to go and post it themselves. That loses the reason for the exception, loses
-- who asked for it, and puts the approver's name on a document they never raised.
--
-- The breach is frozen on the request. An approver decides on the position in front of
-- them, and a figure that moves between asking and deciding makes the decision
-- unauditable afterwards.

CREATE TYPE "CreditApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "CreditDocumentType" AS ENUM ('SALES_ORDER', 'SALES_INVOICE');

CREATE TABLE "credit_approvals" (
  "id"                UUID NOT NULL,
  "requestNo"         TEXT NOT NULL,
  "documentType"      "CreditDocumentType" NOT NULL,
  "documentId"        UUID NOT NULL,
  "documentNumber"    TEXT NOT NULL,
  "customerId"        UUID NOT NULL,
  "customerName"      TEXT NOT NULL,
  "branchId"          UUID NOT NULL,
  "creditLimit"       DECIMAL(14,2) NOT NULL,
  "creditDays"        INTEGER NOT NULL,
  "outstanding"       DECIMAL(14,2) NOT NULL,
  "documentValue"     DECIMAL(14,2) NOT NULL,
  "exposure"          DECIMAL(14,2) NOT NULL,
  "overLimitBy"       DECIMAL(14,2) NOT NULL,
  "oldestOverdueDays" INTEGER NOT NULL DEFAULT 0,
  "overdueAmount"     DECIMAL(14,2) NOT NULL DEFAULT 0,
  "requiredLevel"     INTEGER NOT NULL,
  "reason"            TEXT NOT NULL,
  "status"            "CreditApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decidedBy"         UUID,
  "decidedAt"         TIMESTAMP(3),
  "decisionNote"      TEXT,
  "consumedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedBy"       UUID,

  CONSTRAINT "credit_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_approvals_requestNo_key" ON "credit_approvals"("requestNo");
CREATE INDEX "credit_approvals_status_idx" ON "credit_approvals"("status");
CREATE INDEX "credit_approvals_documentType_documentId_idx"
  ON "credit_approvals"("documentType", "documentId");
CREATE INDEX "credit_approvals_customerId_idx" ON "credit_approvals"("customerId");
CREATE INDEX "credit_approvals_branchId_idx" ON "credit_approvals"("branchId");

ALTER TABLE "credit_approvals"
  ADD CONSTRAINT "credit_approvals_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_approvals"
  ADD CONSTRAINT "credit_approvals_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The request needs its own document series.
ALTER TYPE "DocumentType" ADD VALUE 'CREDIT_APPROVAL';
