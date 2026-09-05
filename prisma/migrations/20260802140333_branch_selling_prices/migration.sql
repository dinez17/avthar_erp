-- CreateTable
CREATE TABLE "product_branch_prices" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "displayPrice" DECIMAL(12,2) NOT NULL,
    "minSellingPrice" DECIMAL(12,2) NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "product_branch_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_branch_prices_branchId_idx" ON "product_branch_prices"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "product_branch_prices_productId_branchId_key" ON "product_branch_prices"("productId", "branchId");

-- AddForeignKey
ALTER TABLE "product_branch_prices" ADD CONSTRAINT "product_branch_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_branch_prices" ADD CONSTRAINT "product_branch_prices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
