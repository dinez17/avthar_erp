ALTER TABLE "quotation_lines" ADD COLUMN "lineNo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sales_order_lines" ADD COLUMN "lineNo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sales_invoice_lines" ADD COLUMN "lineNo" INTEGER NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "quotationId" ORDER BY ctid) AS n
  FROM "quotation_lines"
)
UPDATE "quotation_lines" AS target SET "lineNo" = numbered.n
FROM numbered WHERE target.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "salesOrderId" ORDER BY ctid) AS n
  FROM "sales_order_lines"
)
UPDATE "sales_order_lines" AS target SET "lineNo" = numbered.n
FROM numbered WHERE target.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "salesInvoiceId" ORDER BY ctid) AS n
  FROM "sales_invoice_lines"
)
UPDATE "sales_invoice_lines" AS target SET "lineNo" = numbered.n
FROM numbered WHERE target.id = numbered.id;
