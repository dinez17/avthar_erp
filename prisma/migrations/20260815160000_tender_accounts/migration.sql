-- Name the account on every tender, so money lands somewhere the books can see.
--
-- Until now a receipt recorded "Bank: AXIS" as free text. That is enough to print on a
-- receipt and useless for anything else — it cannot be totalled, reconciled against a
-- statement, or told apart from a second Axis account. Naming a real ledger account lets
-- posting write the amount straight into that account's book.
--
-- Nullable on purpose: receipts and payments raised before accounts existed have no
-- account to point at, and backfilling a guess would put money in the wrong drawer.

ALTER TABLE "customer_receipt_payments" ADD COLUMN "accountId" UUID;
ALTER TABLE "supplier_payment_tenders"  ADD COLUMN "accountId" UUID;

ALTER TABLE "customer_receipt_payments"
  ADD CONSTRAINT "customer_receipt_payments_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_tenders"
  ADD CONSTRAINT "supplier_payment_tenders_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "customer_receipt_payments_accountId_idx" ON "customer_receipt_payments"("accountId");
CREATE INDEX "supplier_payment_tenders_accountId_idx"  ON "supplier_payment_tenders"("accountId");
