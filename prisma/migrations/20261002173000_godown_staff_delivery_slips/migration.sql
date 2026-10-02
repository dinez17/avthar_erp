-- Godown staff may see and print only the godowns assigned to their login.
CREATE TABLE "user_godowns" (
  "userId" UUID NOT NULL,
  "godownId" UUID NOT NULL,
  CONSTRAINT "user_godowns_pkey" PRIMARY KEY ("userId", "godownId"),
  CONSTRAINT "user_godowns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_godowns_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "godowns"("id") ON DELETE CASCADE
);
CREATE INDEX "user_godowns_godownId_idx" ON "user_godowns"("godownId");

-- The unique key is the durable one-copy rule, including simultaneous browsers.
CREATE TABLE "delivery_slip_prints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "salesInvoiceId" UUID NOT NULL,
  "godownId" UUID NOT NULL,
  "printedBy" UUID NOT NULL,
  "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_slip_prints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_slip_prints_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT,
  CONSTRAINT "delivery_slip_prints_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "godowns"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "delivery_slip_prints_salesInvoiceId_godownId_key" ON "delivery_slip_prints"("salesInvoiceId", "godownId");
CREATE INDEX "delivery_slip_prints_printedBy_idx" ON "delivery_slip_prints"("printedBy");

-- Keep assignments on the existing dedicated role while giving it the business-facing name.
UPDATE "roles"
SET "name" = 'GODOWN STAFF',
    "description" = 'Can view and print one delivery-slip copy for assigned godowns',
    "updatedAt" = now(),
    "version" = "version" + 1
WHERE "name" = 'DELIVERY SLIP PRINT'
  AND NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'GODOWN STAFF');
