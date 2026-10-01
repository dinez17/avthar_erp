-- Gross line totals can imply fractional unit rates (for example 178243.50 / 20).
-- Retain enough precision to reproduce the supplier's entered taxable total.
ALTER TABLE "purchase_invoice_lines"
  ALTER COLUMN "rate" TYPE DECIMAL(14,8);
