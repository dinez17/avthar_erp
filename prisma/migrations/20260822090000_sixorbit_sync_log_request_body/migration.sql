-- The JSON posted in SixOrbit's single `data` field, so a rejected write can be read back.
--
-- Their errors name a field but never quote the value ("Please Provide valid item name"),
-- and the query string already stored carries none of the payload. Nullable and untouched
-- for existing rows: a GET has no body, and history cannot be reconstructed.
ALTER TABLE "sixorbit_sync_logs" ADD COLUMN "requestBody" TEXT;
