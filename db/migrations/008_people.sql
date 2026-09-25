-- Sankari Holding: Unified Systems Platform
-- Migration 008 - add people by email before their first sign-in.
--
-- Adds the 'manager' role (someone who approves for their reports even before they have
-- any), and records who added a person and when. Additive only.
-- Reverse with db/rollback/008_people.down.sql.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant','ceo','owner','manager']::text[]);

ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at timestamptz;
