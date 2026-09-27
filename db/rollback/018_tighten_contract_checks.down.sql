-- Reverses db/migrations/018_tighten_contract_checks.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/018_tighten_contract_checks.down.sql
-- Puts back the 014 and 015 checks (which let NULL combinations through). No data changes.
BEGIN;
ALTER TABLE contract_line_items DROP CONSTRAINT IF EXISTS contract_lines_weeks_valid;
ALTER TABLE contract_line_items ADD CONSTRAINT contract_lines_weeks_valid CHECK (
  (weeks_per_month IS NULL AND days_per_week IS NULL)
  OR (weeks_per_month BETWEEN 1 AND 4 AND days_per_week BETWEEN 1 AND 7));
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_adjustment_valid;
ALTER TABLE contracts ADD CONSTRAINT contracts_adjustment_valid CHECK (
  (adjustment_kind IS NULL AND adjustment_bps = 0 AND discount_cents = 0)
  OR (adjustment_kind = 'discount' AND adjustment_bps BETWEEN 1 AND 9000 AND discount_cents >= 0)
  OR (adjustment_kind = 'markup' AND adjustment_bps BETWEEN 1 AND 20000 AND discount_cents = 0));
DELETE FROM schema_migrations WHERE filename = '018_tighten_contract_checks.sql';
COMMIT;
