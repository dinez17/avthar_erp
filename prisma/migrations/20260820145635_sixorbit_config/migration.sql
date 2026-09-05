-- CreateEnum
CREATE TYPE "SixOrbitEntityType" AS ENUM ('CONNECTION', 'MASTER', 'CUSTOMER', 'PRODUCT', 'SALES_ORDER');

-- CreateEnum
CREATE TYPE "SixOrbitDirection" AS ENUM ('PUSH', 'PULL');

-- CreateTable
CREATE TABLE "sixorbit_config" (
    "id" UUID NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL DEFAULT '123',
    "email" TEXT NOT NULL,
    "passwordCipher" TEXT NOT NULL,
    "passwordIv" TEXT NOT NULL,
    "passwordTag" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenUserId" TEXT,
    "tokenFetchedAt" TIMESTAMP(3),
    "requestTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sixorbit_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sixorbit_sync_logs" (
    "id" UUID NOT NULL,
    "entityType" "SixOrbitEntityType" NOT NULL,
    "entityId" UUID,
    "externalId" TEXT,
    "task" TEXT NOT NULL,
    "direction" "SixOrbitDirection" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL,
    "resultCode" TEXT,
    "message" TEXT,
    "requestSummary" TEXT,
    "responseBody" TEXT,
    "durationMs" INTEGER NOT NULL,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sixorbit_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sixorbit_config_isActive_deletedAt_idx" ON "sixorbit_config"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "sixorbit_sync_logs_entityType_entityId_idx" ON "sixorbit_sync_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "sixorbit_sync_logs_success_createdAt_idx" ON "sixorbit_sync_logs"("success", "createdAt");

-- CreateIndex
CREATE INDEX "sixorbit_sync_logs_createdAt_idx" ON "sixorbit_sync_logs"("createdAt");
