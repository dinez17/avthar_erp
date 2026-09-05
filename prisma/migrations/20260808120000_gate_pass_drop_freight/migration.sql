-- Freight is agreed with each customer, so it is charged per drop rather than
-- apportioned from what the lorry cost.

-- AlterTable
ALTER TABLE "gate_pass_documents" ADD COLUMN     "freightCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "billedFreight" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill: an existing drop was charged whatever its invoice already billed, which
-- leaves nothing outstanding at the door — the behaviour before this column existed.
UPDATE "gate_pass_documents" AS d
SET "billedFreight" = i."freightCharge",
    "freightCharge" = i."freightCharge"
FROM "sales_invoices" AS i
WHERE d."salesInvoiceId" = i."id";
