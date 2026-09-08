-- Adds the app.logo setting.
--
-- PATCH /settings/:key only UPDATES an existing row — there is no upsert — so a key
-- that was never seeded cannot be set from the Settings screen at all. Production has
-- RUN_SEED=false, so re-running the seed is not the answer either; the row has to
-- arrive with a migration.
--
-- The value is the logo as a data URI, or the empty string when none is set. Empty
-- rather than NULL because settings.value is NOT NULL, and every other setting treats
-- "unset" the same way.
--
-- Stored inline instead of as a file path so the logo is covered by pg_dump. The
-- uploads volume is not part of the database backup (see scripts/backup-db.sh), and a
-- restore that brought back every invoice but lost the letterhead would be a poor
-- surprise on a bad day.
INSERT INTO settings (id, key, value, description, "createdAt", "updatedAt", version)
VALUES (
  gen_random_uuid(),
  'app.logo',
  '',
  'Company logo shown in the sidebar, on the login screen, on printed documents and as the browser icon. Upload it from Settings rather than pasting a value here.',
  now(),
  now(),
  1
)
ON CONFLICT (key) DO NOTHING;

-- app.name is seeded on a fresh install, but a database created before that entry
-- existed would have no row to update. Same guard, so the Settings screen can always
-- edit it.
INSERT INTO settings (id, key, value, description, "createdAt", "updatedAt", version)
VALUES (
  gen_random_uuid(),
  'app.name',
  'Tiles ERP',
  'Display name used across the UI',
  now(),
  now(),
  1
)
ON CONFLICT (key) DO NOTHING;
