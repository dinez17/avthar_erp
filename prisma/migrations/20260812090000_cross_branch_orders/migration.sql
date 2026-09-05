-- Cross-branch orders: one order may be served from several branches, and therefore
-- becomes several invoices.
--
-- Off by default. Drawing stock from another branch turns one order into invoices under
-- different GSTINs, which is a decision rather than a default — and existing orders were
-- all confirmed under the old single-branch rule, so false is what actually happened.

ALTER TABLE "sales_orders"
  ADD COLUMN "allowCrossBranch" BOOLEAN NOT NULL DEFAULT false;
