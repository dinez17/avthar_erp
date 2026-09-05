-- The cash and the vehicle arrive at different times: a trip closes at the gate, and the
-- driver settles at the counter afterwards — often for several trips at once.

-- CreateTable
CREATE TABLE "driver_cash_handovers" (
    "id" UUID NOT NULL,
    "handoverNo" TEXT NOT NULL,
    "branchId" UUID NOT NULL,
    "driverId" UUID,
    "driverName" TEXT NOT NULL,
    "handoverDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "receivedBy" UUID,
    "receivedByName" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "driver_cash_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_cash_handover_lines" (
    "id" UUID NOT NULL,
    "handoverId" UUID NOT NULL,
    "gatePassId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "driver_cash_handover_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_cash_handovers_handoverNo_key" ON "driver_cash_handovers"("handoverNo");

-- CreateIndex
CREATE INDEX "driver_cash_handovers_branchId_idx" ON "driver_cash_handovers"("branchId");

-- CreateIndex
CREATE INDEX "driver_cash_handovers_driverId_idx" ON "driver_cash_handovers"("driverId");

-- CreateIndex
CREATE INDEX "driver_cash_handovers_handoverDate_idx" ON "driver_cash_handovers"("handoverDate");

-- CreateIndex
CREATE INDEX "driver_cash_handovers_deletedAt_idx" ON "driver_cash_handovers"("deletedAt");

-- CreateIndex
CREATE INDEX "driver_cash_handover_lines_handoverId_idx" ON "driver_cash_handover_lines"("handoverId");

-- CreateIndex
CREATE INDEX "driver_cash_handover_lines_gatePassId_idx" ON "driver_cash_handover_lines"("gatePassId");

-- AddForeignKey
ALTER TABLE "driver_cash_handovers" ADD CONSTRAINT "driver_cash_handovers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_cash_handovers" ADD CONSTRAINT "driver_cash_handovers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_cash_handover_lines" ADD CONSTRAINT "driver_cash_handover_lines_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "driver_cash_handovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_cash_handover_lines" ADD CONSTRAINT "driver_cash_handover_lines_gatePassId_fkey" FOREIGN KEY ("gatePassId") REFERENCES "gate_passes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cash already recorded at close becomes a handover of its own, so the projection on the
-- gate pass keeps agreeing with the lines behind it.
INSERT INTO "driver_cash_handovers" (
  "id", "handoverNo", "branchId", "driverId", "driverName", "handoverDate",
  "amount", "receivedBy", "remarks", "createdAt", "updatedAt", "version"
)
SELECT gen_random_uuid(),
       'DCH-MIG-' || LPAD((ROW_NUMBER() OVER (ORDER BY p."closedAt"))::text, 5, '0'),
       p."branchId", p."driverId", COALESCE(p."driverName", 'Not recorded'),
       COALESCE(p."closedAt", p."passDate"), p."cashHandedOver", p."closedBy",
       'Recorded when the trip was closed', NOW(), NOW(), 1
FROM "gate_passes" AS p
WHERE p."cashHandedOver" > 0;

INSERT INTO "driver_cash_handover_lines" ("id", "handoverId", "gatePassId", "amount")
SELECT gen_random_uuid(), h."id", p."id", p."cashHandedOver"
FROM "gate_passes" AS p
JOIN "driver_cash_handovers" AS h
  ON h."branchId" = p."branchId"
 AND h."amount" = p."cashHandedOver"
 AND h."handoverDate" = COALESCE(p."closedAt", p."passDate")
 AND h."remarks" = 'Recorded when the trip was closed'
WHERE p."cashHandedOver" > 0;
