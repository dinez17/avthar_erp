-- The explicit supplier product catalogue.
--
-- Until now the only supplier-to-product link was the rate history written from posted
-- invoices, so a supplier with no purchase history mapped to nothing. This table is the
-- deliberate mapping an admin manages — which products a supplier supplies — and it is what
-- the supplier portal lists. The optional rate prefills a raised purchase order.

CREATE TABLE "supplier_products" (
  "id"         UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "productId"  UUID NOT NULL,
  "rate"       DECIMAL(12,2),
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"  UUID,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "updatedBy"  UUID,
  "deletedAt"  TIMESTAMP(3),
  "deletedBy"  UUID,
  "version"    INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_products_supplierId_productId_key"
  ON "supplier_products"("supplierId", "productId");
CREATE INDEX "supplier_products_supplierId_idx" ON "supplier_products"("supplierId");
CREATE INDEX "supplier_products_productId_idx" ON "supplier_products"("productId");
CREATE INDEX "supplier_products_deletedAt_idx" ON "supplier_products"("deletedAt");

ALTER TABLE "supplier_products"
  ADD CONSTRAINT "supplier_products_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_products"
  ADD CONSTRAINT "supplier_products_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
