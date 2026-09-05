-- Freeze the cost of what was sold, on the line that sold it.
--
-- Margin was going to be worked out from the product's current landing cost, which means
-- a purchase made next month would silently restate last month's profit. Every other
-- figure on an invoice is already frozen at posting — the customer's name, the GST rate,
-- the place of supply — for exactly this reason, and cost is no different.
--
-- Nullable because invoices posted before this existed have no honest figure to put here.
-- The profit report says so rather than guessing: a margin computed from today's cost
-- against last year's price is not a margin, and filling the column in would make the
-- gap invisible.

ALTER TABLE "sales_invoice_lines" ADD COLUMN "unitCost" DECIMAL(12,2);
