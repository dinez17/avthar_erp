-- Portals: external logins for suppliers (and, later, customers), plus a supplier's
-- acknowledgement of a purchase order.
--
-- A portal account is a link table between a login (user) and the party it may act for. A
-- table rather than a column on the user, so one login can front more than one party, and
-- so access is granted and revoked without touching the user. Both sides cascade-delete:
-- removing a user or a party removes its portal links.
--
-- Purchase orders gain a supplier-facing acknowledgement — pending until the supplier acts
-- from the portal, then acknowledged or queried with a note — kept separate from the
-- internal approval status.

CREATE TYPE "PoAckStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'QUERIED');
CREATE TYPE "PortalPartyType" AS ENUM ('SUPPLIER', 'CUSTOMER');

ALTER TABLE "purchase_orders"
  ADD COLUMN "supplierAckStatus" "PoAckStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "supplierAckAt" TIMESTAMP(3),
  ADD COLUMN "supplierAckNote" TEXT;

CREATE TABLE "portal_accounts" (
  "id"         UUID NOT NULL,
  "userId"     UUID NOT NULL,
  "partyType"  "PortalPartyType" NOT NULL,
  "supplierId" UUID,
  "customerId" UUID,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"  UUID,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "updatedBy"  UUID,
  "deletedAt"  TIMESTAMP(3),
  "deletedBy"  UUID,
  "version"    INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "portal_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_accounts_userId_supplierId_key" ON "portal_accounts"("userId", "supplierId");
CREATE UNIQUE INDEX "portal_accounts_userId_customerId_key" ON "portal_accounts"("userId", "customerId");
CREATE INDEX "portal_accounts_deletedAt_idx" ON "portal_accounts"("deletedAt");
CREATE INDEX "portal_accounts_supplierId_idx" ON "portal_accounts"("supplierId");
CREATE INDEX "portal_accounts_customerId_idx" ON "portal_accounts"("customerId");

ALTER TABLE "portal_accounts"
  ADD CONSTRAINT "portal_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_accounts"
  ADD CONSTRAINT "portal_accounts_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_accounts"
  ADD CONSTRAINT "portal_accounts_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
