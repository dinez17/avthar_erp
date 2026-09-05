/*
  Warnings:

  - A unique constraint covering the columns `[sixorbitId]` on the table `brands` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sixorbitId]` on the table `categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sixorbitId]` on the table `products` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ProductSyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'NEEDS_ATTENTION', 'FAILED');

-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "sixorbitId" TEXT;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "sixorbitId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sixorbitId" TEXT,
ADD COLUMN     "sixorbitNumber" TEXT,
ADD COLUMN     "sixorbitRaw" JSONB,
ADD COLUMN     "sixorbitSyncError" TEXT,
ADD COLUMN     "sixorbitSyncStatus" "ProductSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
ADD COLUMN     "sixorbitSyncedAt" TIMESTAMP(3),
ADD COLUMN     "sixorbitWarnings" TEXT[];

-- CreateTable
CREATE TABLE "sixorbit_product_attributes" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "aid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avid" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sixorbit_product_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sixorbit_product_attributes_productId_idx" ON "sixorbit_product_attributes"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "sixorbit_product_attributes_productId_aid_key" ON "sixorbit_product_attributes"("productId", "aid");

-- CreateIndex
CREATE UNIQUE INDEX "brands_sixorbitId_key" ON "brands"("sixorbitId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_sixorbitId_key" ON "categories"("sixorbitId");

-- CreateIndex
CREATE UNIQUE INDEX "products_sixorbitId_key" ON "products"("sixorbitId");

-- AddForeignKey
ALTER TABLE "sixorbit_product_attributes" ADD CONSTRAINT "sixorbit_product_attributes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
