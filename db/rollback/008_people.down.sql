-- Reverses db/migrations/008_people.sql. Run by hand only.
-- Refuses while anyone holds the manager role or was added by an admin, so no one loses access.
BEGIN;
DO $$ DECLARE v_mgr bigint; v_inv bigint; BEGIN
  SELECT count(*) INTO v_mgr FROM users WHERE 'manager' = ANY(roles);
  SELECT count(*) INTO v_inv FROM users WHERE invited_at IS NOT NULL;
  IF v_mgr + v_inv > 0 THEN
    RAISE EXCEPTION 'rollback refused: manager role holders=%, people added by an admin=%', v_mgr, v_inv;
  END IF;
END $$;
ALTER TABLE users DROP COLUMN IF EXISTS invited_at;
ALTER TABLE users DROP COLUMN IF EXISTS invited_by_user_id;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant','ceo','owner']::text[]);
DELETE FROM schema_migrations WHERE filename = '008_people.sql';
COMMIT;
