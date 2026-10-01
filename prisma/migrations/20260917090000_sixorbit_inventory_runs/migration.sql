CREATE TABLE "sixorbit_inventory_runs" (
 "id" UUID NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PREVIEW',
 "startDate" TEXT NOT NULL,
 "endDate" TEXT NOT NULL,
 "report" JSONB NOT NULL,
 "summary" JSONB NOT NULL,
 "createdBy" UUID,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "appliedAt" TIMESTAMP(3),
 CONSTRAINT "sixorbit_inventory_runs_pkey" PRIMARY KEY ("id")
);
