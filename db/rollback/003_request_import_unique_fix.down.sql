-- Reverses db/migrations/003_request_import_unique_fix.sql by marking it unapplied.
-- Run by hand only:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/003_request_import_unique_fix.down.sql
--
-- The partial index requests_import_unique_idx is intentionally KEPT: it is what the
-- current 001_initial.sql defines. Re-creating the old NULLS NOT DISTINCT constraint
-- would fail as soon as two portal requests exist and would block every new
-- submission again, so this rollback does not do that.
BEGIN;
DELETE FROM schema_migrations WHERE filename = '003_request_import_unique_fix.sql';
COMMIT;
