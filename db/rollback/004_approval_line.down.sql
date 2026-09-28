-- Reverses db/migrations/004_approval_line.sql.
-- Run by hand only:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/004_approval_line.down.sql
--
-- Refuses to run if the approval line or the sample flag already holds data, so
-- a rollback can never silently drop decisions or classifications. Export and
-- confirm first, then remove the guard deliberately.

BEGIN;

DO $$
DECLARE v_steps bigint; v_managers bigint; v_ceos bigint; v_required bigint; v_sample bigint;
BEGIN
  SELECT count(*) INTO v_steps FROM approval_steps;
  SELECT count(*) INTO v_managers FROM users WHERE manager_user_id IS NOT NULL;
  SELECT count(*) INTO v_ceos FROM users WHERE 'ceo' = ANY(roles);
  SELECT count(*) INTO v_required FROM requests WHERE approval_required;
  SELECT (SELECT count(*) FROM companies WHERE sample IS NOT NULL) + (SELECT count(*) FROM services WHERE sample IS NOT NULL)
       + (SELECT count(*) FROM subscriptions WHERE sample IS NOT NULL) + (SELECT count(*) FROM purchase_requests WHERE sample IS NOT NULL)
       + (SELECT count(*) FROM contracts WHERE sample IS NOT NULL) + (SELECT count(*) FROM invoices WHERE sample IS NOT NULL)
       + (SELECT count(*) FROM payables WHERE sample IS NOT NULL) + (SELECT count(*) FROM ledger_entries WHERE sample IS NOT NULL)
       + (SELECT count(*) FROM contract_assignments WHERE sample IS NOT NULL)
    INTO v_sample;
  IF v_steps + v_managers + v_ceos + v_required + v_sample > 0 THEN
    RAISE EXCEPTION 'rollback refused: data present (approval_steps=%, users with manager=%, ceo users=%, approval requests=%, classified sample rows=%)',
      v_steps, v_managers, v_ceos, v_required, v_sample;
  END IF;
END $$;

DELETE FROM settings WHERE key = 'approvals';

DROP FUNCTION IF EXISTS installment_split(bigint, integer, integer);

ALTER TABLE contract_assignments DROP COLUMN IF EXISTS sample;
ALTER TABLE ledger_entries       DROP COLUMN IF EXISTS sample;
ALTER TABLE payables             DROP COLUMN IF EXISTS sample;
ALTER TABLE invoices             DROP COLUMN IF EXISTS sample;
ALTER TABLE contracts            DROP COLUMN IF EXISTS sample;
ALTER TABLE purchase_requests    DROP COLUMN IF EXISTS sample;
ALTER TABLE subscriptions        DROP COLUMN IF EXISTS sample;
ALTER TABLE services             DROP COLUMN IF EXISTS sample;
ALTER TABLE companies            DROP COLUMN IF EXISTS sample;

DROP TRIGGER IF EXISTS subscriptions_card_last4_normalize ON subscriptions;
DROP FUNCTION IF EXISTS normalize_card_last4();

DROP TRIGGER IF EXISTS requests_have_approvers_trg ON requests;
DROP FUNCTION IF EXISTS requests_have_approvers();
DROP TRIGGER IF EXISTS requests_approval_guard_trg ON requests;
DROP FUNCTION IF EXISTS requests_approval_guard();
DROP TRIGGER IF EXISTS approval_steps_derive_trg ON approval_steps;
DROP FUNCTION IF EXISTS approval_steps_derive();
DROP FUNCTION IF EXISTS derive_request_approval_status(uuid);
DROP TRIGGER IF EXISTS approval_steps_guard_trg ON approval_steps;
DROP FUNCTION IF EXISTS approval_steps_guard();
DROP TABLE IF EXISTS approval_steps;

ALTER TABLE requests DROP COLUMN IF EXISTS approval_required;

DROP INDEX IF EXISTS users_manager_idx;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_not_own_manager;
ALTER TABLE users DROP COLUMN IF EXISTS manager_user_id;
DROP INDEX IF EXISTS users_single_active_ceo_idx;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant']::text[]);

DELETE FROM schema_migrations WHERE filename = '004_approval_line.sql';

COMMIT;
