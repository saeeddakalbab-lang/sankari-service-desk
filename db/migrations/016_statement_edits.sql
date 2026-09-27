-- Sankari Holding: Unified Systems Platform
-- Migration 016 - statement lines can be corrected until the statement is sent.
--
-- * statement_credits (card payments and refunds) gain the person and the company they belong to.
-- * Both statement tables gain locked_at. Sending a statement to accounting stamps every line of its
--   period; from then on the line is fixed and a correction is a new line.
-- * Until locked: a payment or refund can be edited in full; a charge (subscription bill) can change
--   only its beneficiary and company, because its amount, date and rate come from the recorded
--   renewal decision. Nothing can ever be deleted. The application audits every edit old -> new.
-- Additive only: new columns with safe defaults; no existing row changes.
-- Reverse with db/rollback/016_statement_edits.down.sql.

ALTER TABLE statement_credits ADD COLUMN IF NOT EXISTS beneficiary text NOT NULL DEFAULT '';
ALTER TABLE statement_credits ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT '';
ALTER TABLE statement_credits ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE statement_credits ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE subscription_bills ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE OR REPLACE FUNCTION statement_credits_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments and refunds cannot be deleted; enter a correcting line instead' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'this line was sent to accounting and is fixed; enter a correcting line instead' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'who entered a line, and when, cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS statement_credits_guard_trg ON statement_credits;
CREATE TRIGGER statement_credits_guard_trg BEFORE UPDATE OR DELETE ON statement_credits FOR EACH ROW EXECUTE FUNCTION statement_credits_guard();

-- Same checks as 010 on insert. An update may only set locked_at, or change the beneficiary and
-- company while the bill is not locked.
CREATE OR REPLACE FUNCTION subscription_bills_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_decision text; v_sub uuid; v_type text; v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'bills are append-only' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'this charge was sent to accounting and is fixed' USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'beneficiary' - 'company_name' - 'locked_at') <> (to_jsonb(OLD) - 'beneficiary' - 'company_name' - 'locked_at') THEN
      RAISE EXCEPTION 'only the beneficiary and company of a bill can be corrected' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
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
