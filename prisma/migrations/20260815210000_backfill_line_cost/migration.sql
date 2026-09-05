-- Give already-posted invoices a cost, and mark it as the estimate it is.
--
-- Cost is captured onto a line when its invoice is posted, so every invoice raised before
-- that existed reports no margin at all — which made the profit report read 100% on every
-- row, a missing number dressed up as a good one.
--
-- This fills the gap from each product's landing cost as it stands today. That is today's
-- cost set against an older sale price, which is exactly the restatement the frozen column
-- exists to prevent, so the estimate is flagged rather than passed off as a fact. The
-- report says which figures are estimated and which were frozen at posting.

ALTER TABLE "sales_invoice_lines"
  ADD COLUMN "costEstimated" BOOLEAN NOT NULL DEFAULT false;

UPDATE "sales_invoice_lines" AS line
SET "unitCost" = product."landingCost",
    "costEstimated" = true
FROM "products" AS product
WHERE line."productId" = product."id"
  AND line."unitCost" IS NULL
  AND product."landingCost" IS NOT NULL;

-- Products with no landing cost are left alone. There is nothing to estimate from, and a
-- zero would report the whole sale as margin — the very thing being fixed here.
