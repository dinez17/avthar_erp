-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "salesmanUserId" UUID;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "isSalesRole" BOOLEAN NOT NULL DEFAULT false;
