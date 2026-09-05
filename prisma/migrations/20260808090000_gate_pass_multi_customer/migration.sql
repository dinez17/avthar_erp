-- One lorry drops at several customers, so whose goods these are belongs on the
-- document rather than on the pass header.

-- AlterTable
ALTER TABLE "gate_pass_documents" ADD COLUMN     "customerId" UUID,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0;

-- Backfill: every existing pass named one customer on its header, so its documents
-- inherit that one. Numbering follows the invoice number, which is the order they were
-- added in.
UPDATE "gate_pass_documents" AS d
SET "customerId" = p."customerId",
    "customerName" = c."name"
FROM "gate_passes" AS p
LEFT JOIN "customers" AS c ON c."id" = p."customerId"
WHERE d."gatePassId" = p."id" AND p."customerId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "gate_pass_documents_customerId_idx" ON "gate_pass_documents"("customerId");

-- AddForeignKey
ALTER TABLE "gate_pass_documents" ADD CONSTRAINT "gate_pass_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
