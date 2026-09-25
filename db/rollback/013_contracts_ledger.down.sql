-- Reverses db/migrations/013_contracts_ledger.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/013_contracts_ledger.down.sql
-- Removes only the guards and the two AED columns. Refuses once a ledger line carries an AED amount,
-- because dropping it would lose the rate that line was converted at.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM ledger_entries WHERE amount_aed_cents IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: ledger lines carry a frozen AED amount';
  END IF;
END $$;
DROP TRIGGER IF EXISTS ledger_entries_guard_trg ON ledger_entries;
DROP FUNCTION IF EXISTS ledger_entries_guard();
DROP TRIGGER IF EXISTS invoices_guard_trg ON invoices;
DROP FUNCTION IF EXISTS invoices_guard();
DROP TRIGGER IF EXISTS contract_lines_guard_trg ON contract_line_items;
DROP FUNCTION IF EXISTS contract_lines_guard();
DROP TRIGGER IF EXISTS contracts_guard_trg ON contracts;
DROP FUNCTION IF EXISTS contracts_guard();
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_aed_pair;
ALTER TABLE ledger_entries DROP COLUMN IF EXISTS amount_aed_cents;
ALTER TABLE ledger_entries DROP COLUMN IF EXISTS aed_rate;
DELETE FROM schema_migrations WHERE filename = '013_contracts_ledger.sql';
COMMIT;
