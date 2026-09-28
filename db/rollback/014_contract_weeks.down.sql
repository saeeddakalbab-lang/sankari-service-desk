-- Reverses db/migrations/014_contract_weeks.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/014_contract_weeks.down.sql
-- Refuses once any line was priced by weeks: those lines would lose how their price was worked out.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM contract_line_items WHERE weeks_per_month IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: contract lines were priced by weeks';
  END IF;
END $$;
ALTER TABLE contract_line_items DROP CONSTRAINT IF EXISTS contract_lines_weeks_valid;
ALTER TABLE contract_line_items DROP COLUMN IF EXISTS days_per_week;
ALTER TABLE contract_line_items DROP COLUMN IF EXISTS weeks_per_month;
DELETE FROM schema_migrations WHERE filename = '014_contract_weeks.sql';
COMMIT;
