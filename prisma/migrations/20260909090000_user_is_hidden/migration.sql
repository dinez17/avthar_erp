-- Hidden maintenance accounts.
--
-- A super admin that belongs to whoever runs the system rather than to the business
-- using it should not sit in the staff user list, where it invites "who is this?" and
-- eventually gets deleted by an admin tidying up.
--
-- Scope is deliberately narrow: this hides the ROW from the user list and the salesman
-- pickers. It does not touch authentication, permissions, or the audit log — a hidden
-- user's actions are recorded and attributed exactly like anyone else's. An account
-- whose work left no trace would be a back door rather than a maintenance login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- Every list query filters on it, and hidden accounts are a tiny minority of the table,
-- so a partial index on the common case keeps those lookups off a sequential scan.
CREATE INDEX IF NOT EXISTS "users_isHidden_idx" ON users ("isHidden") WHERE "isHidden" = false;
