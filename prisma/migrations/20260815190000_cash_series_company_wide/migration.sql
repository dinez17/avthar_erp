-- Cash documents get one counter for the whole company.
--
-- `cash_entries.entryNumber` is unique across the whole table, but the counter was scoped
-- per branch. Two scopes therefore each counted from 1 and, sharing the built-in `CE`
-- prefix, both reached `CE/26-27/0001` — the second insert failed on the unique index.
--
-- It surfaced the moment a day close handed cash to an owner: the drawer's leg numbered
-- against its branch and the owner's leg against the company scope, because an owner
-- account belongs to no branch. Two counters, one namespace.
--
-- Cash accounts can be company-wide by nature, so there was never a meaningful branch to
-- count by. One counter removes the collision instead of papering over it.

ALTER TYPE "DocumentType" ADD VALUE 'CASH_COUNT';

-- Carry the company-wide counter past everything the branch counters already issued, so
-- consolidating cannot hand out a number that is already printed on a row.
--
-- GREATEST against the existing value matters: the company scope may already be ahead of
-- every branch, and moving a counter backwards is how you mint a duplicate.
INSERT INTO "number_sequences" ("id", "documentType", "scope", "financialYear", "lastNumber", "updatedAt")
SELECT gen_random_uuid(), "documentType", '', "financialYear", MAX("lastNumber"), NOW()
FROM "number_sequences"
WHERE "documentType" IN ('CASH_ENTRY', 'EXPENSE')
GROUP BY "documentType", "financialYear"
ON CONFLICT ("documentType", "scope", "financialYear")
DO UPDATE SET
  "lastNumber" = GREATEST("number_sequences"."lastNumber", EXCLUDED."lastNumber"),
  "updatedAt"  = NOW();

-- The branch-scoped rows are left in place rather than deleted. They are inert once the
-- document type is company-wide, and they are the only record of how far each branch had
-- counted — worth keeping if this ever has to be understood again.
