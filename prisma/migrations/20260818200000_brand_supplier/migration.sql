-- Supplier is chosen on the brand: every product under a brand is supplied by that brand's
-- supplier. This replaces the abandoned per-product mapping.
--
-- Nullable, and set-null on supplier delete, so a brand simply loses its supplier rather
-- than blocking the delete. The DROP is defensive — it clears the short-lived
-- supplier_products table if an earlier build had created it.

ALTER TABLE "brands" ADD COLUMN "supplierId" UUID;
CREATE INDEX "brands_supplierId_idx" ON "brands"("supplierId");

ALTER TABLE "brands"
  ADD CONSTRAINT "brands_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE IF EXISTS "supplier_products";
