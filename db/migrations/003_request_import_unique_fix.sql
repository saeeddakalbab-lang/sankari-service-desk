-- Sankari Holding: Unified Systems Platform
-- Migration 003 - repair databases built from an early 001_initial.sql.
--
-- Early builds created requests.request_import_unique as
--   UNIQUE NULLS NOT DISTINCT (import_source, import_id)
-- which treats every portal-submitted request (both columns NULL) as a duplicate:
-- only the first can ever be saved. The current 001 already replaces it with a
-- partial unique index, but 001 does not re-run on a database that recorded it.
-- On a correctly built database this migration is a no-op.
--
-- Uniqueness of real import keys is preserved: the partial index enforces it for
-- every row that has both values. The old constraint was strictly stronger, so no
-- existing row can violate the new index.
-- Reverse with db/rollback/003_request_import_unique_fix.down.sql.

CREATE UNIQUE INDEX IF NOT EXISTS requests_import_unique_idx ON requests(import_source, import_id)
  WHERE import_source IS NOT NULL AND import_id IS NOT NULL;
ALTER TABLE requests DROP CONSTRAINT IF EXISTS request_import_unique;
