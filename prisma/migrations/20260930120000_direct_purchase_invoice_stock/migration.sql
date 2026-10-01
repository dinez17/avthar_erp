-- A direct purchase invoice receives stock without a preceding GRN, so it must retain
-- the godown selected while the draft is entered. Existing invoices remain nullable.
ALTER TABLE "purchase_invoices"
ADD COLUMN "godownId" UUID;

CREATE INDEX "purchase_invoices_godownId_idx"
ON "purchase_invoices"("godownId");

ALTER TABLE "purchase_invoices"
ADD CONSTRAINT "purchase_invoices_godownId_fkey"
FOREIGN KEY ("godownId") REFERENCES "godowns"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
