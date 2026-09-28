-- Reverses db/migrations/020_quotes_roles_deletes.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/020_quotes_roles_deletes.down.sql
-- Refuses while any row uses what 020 added. PostgreSQL cannot drop enum values, so 'quote_sent'
-- and 'quote_accepted' stay in the type, unused: the restored guard never moves a contract into them.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM contracts WHERE status::text IN ('quote_sent','quote_accepted') OR quote_sent_at IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: contracts are in the quotation steps';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE 'contracts' = ANY(roles)) THEN
    RAISE EXCEPTION 'rollback refused: users hold the contracts role';
  END IF;
  IF EXISTS (SELECT 1 FROM statement_credits WHERE department <> '') THEN
    RAISE EXCEPTION 'rollback refused: payments carry a department';
  END IF;
END $$;
-- The 019 contracts guard, and the 016 / 017 line guards (no deletes).
CREATE OR REPLACE FUNCTION contracts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    ok := (OLD.status, NEW.status) IN (
      ('submitted','under_review'), ('submitted','approved'), ('under_review','approved'),
      ('submitted','rejected'), ('under_review','rejected'),
      ('approved','contract_sent'), ('contract_sent','signed'), ('signed','active'), ('active','completed'),
      ('submitted','cancelled'), ('under_review','cancelled'), ('approved','cancelled'), ('contract_sent','cancelled'),
      ('signed','cancelled'), ('active','cancelled'));
    IF NOT ok THEN
      RAISE EXCEPTION 'contract cannot move from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('rejected','cancelled') AND coalesce(btrim(NEW.rejection_reason),'') = '' THEN
      RAISE EXCEPTION 'a reason is required to reject or cancel a contract' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'signed' AND coalesce(btrim(NEW.signed_evidence),'') = '' THEN
      RAISE EXCEPTION 'record how the client confirmed before marking the contract signed' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'active' AND (NEW.start_date IS NULL OR NEW.end_date IS NULL) THEN
      RAISE EXCEPTION 'an active contract needs its start and end dates' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD.status NOT IN ('submitted','under_review') AND (
       NEW.total_cents <> OLD.total_cents OR NEW.subtotal_cents <> OLD.subtotal_cents OR NEW.onsite_premium_cents <> OLD.onsite_premium_cents
    OR NEW.currency <> OLD.currency OR NEW.pricing_snapshot <> OLD.pricing_snapshot OR NEW.duration_months <> OLD.duration_months
    OR NEW.company_name <> OLD.company_name OR NEW.contact_email <> OLD.contact_email OR NEW.reference <> OLD.reference
    OR NEW.adjustment_kind IS DISTINCT FROM OLD.adjustment_kind OR NEW.adjustment_bps <> OLD.adjustment_bps
    OR NEW.discount_cents <> OLD.discount_cents OR NEW.list_total_cents IS DISTINCT FROM OLD.list_total_cents
    OR NEW.client_details <> OLD.client_details) THEN
    RAISE EXCEPTION 'an approved contract''s price and parties are fixed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
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
DROP TRIGGER IF EXISTS contracts_delete_guard_trg ON contracts;
DROP FUNCTION IF EXISTS contracts_delete_guard();
ALTER TABLE statement_credits DROP COLUMN IF EXISTS department;
ALTER TABLE contracts DROP COLUMN IF EXISTS quote_note;
ALTER TABLE contracts DROP COLUMN IF EXISTS quote_decided_at;
ALTER TABLE contracts DROP COLUMN IF EXISTS quote_sent_at;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant','ceo','owner','manager']::text[]);
DELETE FROM schema_migrations WHERE filename = '020_quotes_roles_deletes.sql';
COMMIT;
