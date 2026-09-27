-- Sankari Holding: Unified Systems Platform
-- Migration 017 - subscriptions approved by phone, and who approved them.
--
-- A new subscription or a renewal is sometimes approved on a phone call. It is recorded as a bill of
-- kind 'phone' with the approver's name and the date of the call, so it sits in bill history and the
-- accounting statement next to the portal-approved ones. The database refuses a phone bill without
-- the approver's name and date. Amounts may be in any currency; the rate to AED is frozen on the row.
-- Additive only: the kind check gains one value and the table gains three nullable columns.
-- Reverse with db/rollback/017_phone_approved_bills.down.sql.

ALTER TABLE subscription_bills ADD COLUMN IF NOT EXISTS phone_approved_by text;
ALTER TABLE subscription_bills ADD COLUMN IF NOT EXISTS phone_approved_on date;
ALTER TABLE subscription_bills ADD COLUMN IF NOT EXISTS approval_note text NOT NULL DEFAULT '';
ALTER TABLE subscription_bills DROP CONSTRAINT IF EXISTS subscription_bills_kind_valid;
ALTER TABLE subscription_bills ADD CONSTRAINT subscription_bills_kind_valid CHECK (kind IN ('initial', 'renewal', 'phone'));

-- Same as 016, plus: a phone bill names who approved it and when.
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
  ELSIF NEW.kind = 'phone' THEN
    IF coalesce(btrim(NEW.phone_approved_by), '') = '' OR NEW.phone_approved_on IS NULL THEN
      RAISE EXCEPTION 'a phone-approved bill needs who approved it and the date of the call' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.phone_approved_on > current_date THEN
      RAISE EXCEPTION 'the approval call cannot be in the future' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT type, status INTO v_type, v_status FROM requests WHERE id = NEW.request_id;
    IF v_type IS DISTINCT FROM 'subscription_approval' OR v_status IN ('awaiting_approval', 'rejected', 'cancelled') THEN
      RAISE EXCEPTION 'a first bill needs an approved subscription request' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
