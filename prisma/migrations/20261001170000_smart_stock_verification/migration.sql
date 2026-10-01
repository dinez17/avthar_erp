CREATE TABLE "stock_verifications" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "godownId" UUID NOT NULL,
    "bookQtyBoxes" DECIMAL(14,3) NOT NULL,
    "countedQtyBoxes" DECIMAL(14,3) NOT NULL,
    "differenceBoxes" DECIMAL(14,3) NOT NULL,
    "checkedBy" UUID,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_verifications_branchId_godownId_checkedAt_idx"
ON "stock_verifications"("branchId", "godownId", "checkedAt");
CREATE INDEX "stock_verifications_productId_branchId_godownId_checkedAt_idx"
ON "stock_verifications"("productId", "branchId", "godownId", "checkedAt");

ALTER TABLE "stock_verifications" ADD CONSTRAINT "stock_verifications_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_verifications" ADD CONSTRAINT "stock_verifications_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_verifications" ADD CONSTRAINT "stock_verifications_godownId_fkey"
FOREIGN KEY ("godownId") REFERENCES "godowns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
