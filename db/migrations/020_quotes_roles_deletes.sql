-- Sankari Holding: Unified Systems Platform
-- Migration 020 - quotations before contracts, a Contracts role, and deleting wrong entries.
--
-- * Role 'contracts': runs the contract steps. Finance (invoices, payments, receivables) stays with
--   'accountant'; 'admin' keeps both.
-- * Two contract statuses: quote_sent (the price went to the client) and quote_accepted (the client
--   accepted it); the contract is sent only after that. Price and details freeze from quote_sent.
-- * A contract request with wrong data can be deleted while submitted, under review or rejected
--   (no quotation, no invoices). The application keeps a full copy in audit_log first.
-- * A card payment or refund, or a charge, can be deleted until the statement covering it is sent;
--   after that it stays fixed, as before. The application keeps a full copy in audit_log first.
-- * Card payments and refunds gain the employee's department.
-- Additive: new enum values, columns with defaults, wider checks; no existing row changes.
-- Reverse with db/rollback/020_quotes_roles_deletes.down.sql (enum values cannot be removed; see there).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant','ceo','owner','manager','contracts']::text[]);

ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'quote_sent';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'quote_accepted';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS quote_decided_at timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS quote_note text;

-- Same guard as 019, with the quotation steps.
CREATE OR REPLACE FUNCTION contracts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    ok := (OLD.status, NEW.status) IN (
      ('submitted','under_review'), ('submitted','approved'), ('under_review','approved'),
      ('submitted','rejected'), ('under_review','rejected'),
      ('approved','contract_sent'), ('contract_sent','signed'), ('signed','active'), ('active','completed'),
      ('submitted','cancelled'), ('under_review','cancelled'), ('approved','cancelled'), ('contract_sent','cancelled'),
      ('signed','cancelled'), ('active','cancelled'),
      -- 020: the price goes to the client as a quotation first; the contract follows their acceptance.
      ('submitted','quote_sent'), ('under_review','quote_sent'), ('quote_sent','quote_accepted'), ('quote_sent','rejected'),
      ('quote_sent','cancelled'), ('quote_accepted','contract_sent'), ('quote_accepted','cancelled'));
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

-- Deleting a contract: only before a quotation or an invoice exists.
CREATE OR REPLACE FUNCTION contracts_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status::text NOT IN ('submitted','under_review','rejected') THEN
    RAISE EXCEPTION 'only a request that has not been quoted can be deleted (this one is %)', OLD.status USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM invoices WHERE contract_id = OLD.id) THEN
    RAISE EXCEPTION 'a contract with invoices cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS contracts_delete_guard_trg ON contracts;
CREATE TRIGGER contracts_delete_guard_trg BEFORE DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION contracts_delete_guard();

ALTER TABLE statement_credits ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '';

-- Same as 016, except an unlocked payment or refund may be deleted.
CREATE OR REPLACE FUNCTION statement_credits_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'this line was sent to accounting and cannot be deleted; enter a correcting line instead' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'this line was sent to accounting and is fixed; enter a correcting line instead' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'who entered a line, and when, cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Same as 017, except an unlocked charge may be deleted.
CREATE OR REPLACE FUNCTION subscription_bills_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_decision text; v_sub uuid; v_type text; v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'this charge was sent to accounting and cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
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
