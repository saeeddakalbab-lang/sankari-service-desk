-- Sankari Holding: Unified Systems Platform
-- Migration 013 - contract lifecycle guard, and AED on every ledger line.
--
-- * contracts may only move along the agreed path:
--     submitted -> under_review -> approved -> contract_sent -> signed -> active -> completed
--   with rejected (before signing, reason required) and cancelled (reason required) as the exits.
--   The price, the lines and the client's details are frozen once the contract is sent.
-- * ledger_entries gain the AED amount at a rate frozen on the line, so cash in (USD invoices) and
--   cash out (AED card bills) sum in one currency without re-converting history.
-- * A paid invoice stays paid; an invoice amount never changes after it is sent.
-- Additive only: two nullable columns and triggers; no existing row changes.
-- Reverse with db/rollback/013_contracts_ledger.down.sql.

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS aed_rate numeric(12,6) CONSTRAINT ledger_entries_aed_rate_positive CHECK (aed_rate IS NULL OR aed_rate > 0);
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS amount_aed_cents bigint CONSTRAINT ledger_entries_aed_nonneg CHECK (amount_aed_cents IS NULL OR amount_aed_cents >= 0);
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_aed_pair;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_aed_pair CHECK ((aed_rate IS NULL) = (amount_aed_cents IS NULL));

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
    OR NEW.company_name <> OLD.company_name OR NEW.contact_email <> OLD.contact_email OR NEW.reference <> OLD.reference) THEN
    RAISE EXCEPTION 'an approved contract''s price and parties are fixed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contracts_guard_trg ON contracts;
CREATE TRIGGER contracts_guard_trg BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION contracts_guard();

CREATE OR REPLACE FUNCTION contract_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status contract_status;
BEGIN
  SELECT status INTO v_status FROM contracts WHERE id = coalesce(NEW.contract_id, OLD.contract_id);
  IF v_status NOT IN ('submitted','under_review') THEN
    RAISE EXCEPTION 'contract lines are fixed once the contract is approved' USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS contract_lines_guard_trg ON contract_line_items;
CREATE TRIGGER contract_lines_guard_trg BEFORE UPDATE OR DELETE ON contract_line_items FOR EACH ROW EXECUTE FUNCTION contract_lines_guard();

CREATE OR REPLACE FUNCTION invoices_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoices are never deleted; void them instead' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'a paid invoice stays paid' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'pending' AND (NEW.amount_cents <> OLD.amount_cents OR NEW.currency <> OLD.currency OR NEW.installment <> OLD.installment) THEN
    RAISE EXCEPTION 'an invoice amount is fixed once it is sent' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'paid' AND (NEW.paid_at IS NULL OR NEW.paid_amount_cents IS NULL OR NEW.paid_amount_cents <= 0) THEN
    RAISE EXCEPTION 'a paid invoice needs the date and amount received' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoices_guard_trg ON invoices;
CREATE TRIGGER invoices_guard_trg BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION invoices_guard();

-- Money that moved is history: ledger lines are append-only (correct with a new line).
CREATE OR REPLACE FUNCTION ledger_entries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger lines are append-only; add a correcting line instead' USING ERRCODE = 'check_violation';
END $$;
DROP TRIGGER IF EXISTS ledger_entries_guard_trg ON ledger_entries;
CREATE TRIGGER ledger_entries_guard_trg BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION ledger_entries_guard();
