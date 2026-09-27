-- Reverses db/migrations/017_phone_approved_bills.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/017_phone_approved_bills.down.sql
-- Refuses once any phone-approved bill exists: it would lose who approved it.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM subscription_bills WHERE kind = 'phone' OR phone_approved_by IS NOT NULL OR approval_note <> '') THEN
    RAISE EXCEPTION 'rollback refused: phone-approved bills exist';
  END IF;
END $$;
-- Back to the 016 guard.
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
ALTER TABLE subscription_bills DROP CONSTRAINT IF EXISTS subscription_bills_kind_valid;
ALTER TABLE subscription_bills ADD CONSTRAINT subscription_bills_kind_valid CHECK (kind IN ('initial', 'renewal'));
ALTER TABLE subscription_bills DROP COLUMN IF EXISTS approval_note;
ALTER TABLE subscription_bills DROP COLUMN IF EXISTS phone_approved_on;
ALTER TABLE subscription_bills DROP COLUMN IF EXISTS phone_approved_by;
DELETE FROM schema_migrations WHERE filename = '017_phone_approved_bills.sql';
COMMIT;
