ALTER TABLE "godowns"
ADD COLUMN "allowBilling" BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "godowns" (
  "id", "branchId", "name", "code", "isActive", "allowBilling",
  "createdAt", "updatedAt", "version"
)
SELECT
  gen_random_uuid(), branch."id", 'SHOWROOM DISPLAY', 'SHOWROOM-DISPLAY', true, false,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
FROM "branches" branch
WHERE branch."deletedAt" IS NULL
  AND branch."isActive" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "godowns" godown
    WHERE godown."branchId" = branch."id"
      AND godown."code" = 'SHOWROOM-DISPLAY'
  );

UPDATE "godowns"
SET "allowBilling" = false
WHERE "code" = 'SHOWROOM-DISPLAY'
  AND "deletedAt" IS NULL;
