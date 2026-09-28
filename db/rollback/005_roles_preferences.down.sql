-- Reverses db/migrations/005_roles_preferences.sql.
-- Run by hand only:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/005_roles_preferences.down.sql
--
-- Refuses to run once anyone holds the owner role or has saved a preference, so a
-- rollback never silently drops choices people made.

BEGIN;

DO $$
DECLARE v_owner bigint; v_prefs bigint;
BEGIN
  SELECT count(*) INTO v_owner FROM users WHERE 'owner' = ANY(roles);
  SELECT count(*) INTO v_prefs FROM users WHERE preferred_theme IS NOT NULL OR preferred_locale IS NOT NULL;
  IF v_owner + v_prefs > 0 THEN
    RAISE EXCEPTION 'rollback refused: data present (owner users=%, users with saved preferences=%)', v_owner, v_prefs;
  END IF;
END $$;

DELETE FROM settings WHERE key IN ('branding', 'appearance', 'email_domains');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_preferred_locale_valid;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_preferred_theme_valid;
ALTER TABLE users DROP COLUMN IF EXISTS preferred_locale;
ALTER TABLE users DROP COLUMN IF EXISTS preferred_theme;
DROP INDEX IF EXISTS users_single_active_owner_idx;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant','ceo']::text[]);

DELETE FROM schema_migrations WHERE filename = '005_roles_preferences.sql';

COMMIT;
