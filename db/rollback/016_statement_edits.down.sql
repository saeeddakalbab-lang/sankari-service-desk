-- Reverses db/migrations/016_statement_edits.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/016_statement_edits.down.sql
-- Refuses once any payment or refund carries a person or company, or any line was locked by a sent
-- statement: that information would be lost.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM statement_credits WHERE beneficiary <> '' OR company_name <> '' OR locked_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM subscription_bills WHERE locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: statement lines carry a person, a company or a lock';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION statement_credits_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payments and refunds are append-only; enter a correcting line instead' USING ERRCODE = 'check_violation';
END $$;
CREATE OR REPLACE FUNCTION subscription_bills_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_decision text; v_sub uuid; v_type text; v_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'bills are append-only' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'renewal' THEN
    SELECT decision, subscription_id INTO v_decision, v_sub FROM subscription_renewals WHERE id = NEW.renewal_id;
    IF v_decision IS DISTINCT FROM 'renew' OR v_sub <> NEW.subscription_id THEN
      RAISE EXCEPTION 'a renewal bill needs the owner''s recorded decision to renew' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT type, status INTO v_type, v_status FROM requests WHERE id = NEW.request_id;
    IF v_type IS DISTINCT FROM 'subscription_approval' OR v_status IN ('awaiting_approval', 'rejected', 'cancelled') THEN
      RAISE EXCEPTION 'a first bill needs an approved subscription request' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER TABLE subscription_bills DROP COLUMN IF EXISTS locked_at;
ALTER TABLE statement_credits DROP COLUMN IF EXISTS updated_at;
ALTER TABLE statement_credits DROP COLUMN IF EXISTS locked_at;
ALTER TABLE statement_credits DROP COLUMN IF EXISTS company_name;
ALTER TABLE statement_credits DROP COLUMN IF EXISTS beneficiary;
DELETE FROM schema_migrations WHERE filename = '016_statement_edits.sql';
COMMIT;
