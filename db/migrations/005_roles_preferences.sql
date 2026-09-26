-- Sankari Holding: Unified Systems Platform
-- Migration 005 - Owner role, per-user theme and language, admin-editable
-- branding, default theme and email domains.
--
-- Additive only. Reverse with db/rollback/005_roles_preferences.down.sql.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant','ceo','owner']::text[]);

-- Exactly zero or one active Owner, the same way as the CEO.
CREATE UNIQUE INDEX IF NOT EXISTS users_single_active_owner_idx ON users ((true))
  WHERE 'owner' = ANY(roles) AND disabled_at IS NULL;

-- NULL = not chosen yet: the platform default applies.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_theme text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_locale text;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_preferred_theme_valid CHECK (preferred_theme IS NULL OR preferred_theme IN ('light','dark','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_preferred_locale_valid CHECK (preferred_locale IS NULL OR preferred_locale IN ('en','ar'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO settings(key, value) VALUES
  ('branding', '{"accentHex":"#B84F27"}'::jsonb),
  ('appearance', '{"defaultTheme":"system"}'::jsonb),
  ('email_domains', '{"domains":["sankari-holding.com"],"default":"sankari-holding.com"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
