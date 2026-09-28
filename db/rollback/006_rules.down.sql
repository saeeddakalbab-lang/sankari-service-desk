-- Reverses db/migrations/006_rules.sql. Run by hand only.
-- Refuses once an admin has edited the rules, so a rollback never throws away their decisions.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM settings WHERE key = 'rules' AND updated_by IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: the rules were edited by an admin; export them first';
  END IF;
END $$;
DELETE FROM settings WHERE key = 'rules';
DELETE FROM schema_migrations WHERE filename = '006_rules.sql';
COMMIT;
