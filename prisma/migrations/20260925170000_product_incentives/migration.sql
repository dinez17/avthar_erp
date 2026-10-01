CREATE TABLE "product_incentives" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "validFrom" DATE NOT NULL,
  "validTo" DATE NOT NULL,
  "amountPerBox" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_incentives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_incentives_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_incentives_date_check" CHECK ("validTo" >= "validFrom"),
  CONSTRAINT "product_incentives_amount_check" CHECK ("amountPerBox" >= 0)
);
CREATE INDEX "product_incentives_productId_validFrom_validTo_idx" ON "product_incentives"("productId", "validFrom", "validTo");
