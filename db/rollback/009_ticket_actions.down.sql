-- Reverses db/migrations/009_ticket_actions.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/009_ticket_actions.down.sql
-- Refuses once any link has been used: who clicked Start or Reject is history. Unused links are
-- only pending emails; dropping them just makes those email buttons stop working.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM action_tokens WHERE used_at IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: email action links have been used';
  END IF;
END $$;
DROP TRIGGER IF EXISTS action_tokens_guard_trg ON action_tokens;
DROP FUNCTION IF EXISTS action_tokens_guard();
DROP TABLE IF EXISTS action_tokens;
DELETE FROM schema_migrations WHERE filename = '009_ticket_actions.sql';
COMMIT;
