-- One-off repair, safe to delete once it has been run. Both statements are idempotent.
--
-- `prisma migrate dev` once generated 20260815154605_day_close, a stub that dropped
-- driver_cash_handovers_accountId_idx because the index existed in the database but was
-- not declared on the Prisma model. Its timestamp sorts before the migration that creates
-- the index, so every shadow-database replay dropped it before it existed and failed.
--
-- The model now declares @@index([accountId]) and the stub migration file is gone.

-- 1. Forget the stub, so Prisma does not look for a migration file that no longer exists.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260815154605_day_close';

-- 2. Put back the index the stub dropped. 20260815170000_day_close is recorded as applied
--    and that migration creates this index, so without it the database and the migration
--    history disagree — which is the drift Prisma offers to fix by wiping the database.
CREATE INDEX IF NOT EXISTS "driver_cash_handovers_accountId_idx"
  ON "driver_cash_handovers"("accountId");
