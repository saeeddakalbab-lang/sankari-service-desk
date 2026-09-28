-- Reverses db/migrations/022_team_links.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/022_team_links.down.sql
-- Managers already linked stay linked (users.manager_user_id is untouched). Refuses while any claim
-- or team entry exists, because dropping them would lose who asked for what.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM team_claims) OR EXISTS (SELECT 1 FROM users WHERE manager_claim_email IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: people have named managers or team members';
  END IF;
END $$;
DROP TABLE IF EXISTS team_claims;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_manager_claim_valid;
ALTER TABLE users DROP COLUMN IF EXISTS manager_claim_at;
ALTER TABLE users DROP COLUMN IF EXISTS manager_claim_name;
ALTER TABLE users DROP COLUMN IF EXISTS manager_claim_email;
DELETE FROM schema_migrations WHERE filename = '022_team_links.sql';
COMMIT;
