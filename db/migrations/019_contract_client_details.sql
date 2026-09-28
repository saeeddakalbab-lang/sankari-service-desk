-- Sankari Holding: Unified Systems Platform
-- Migration 019 - the client details a contract document needs (legal name, registry and tax
-- numbers, representative and title, address, city, sites, coverage hours).
--
-- One jsonb column with an empty default: existing contracts keep working and print [●] where a detail
-- is missing. Like the price and the parties, the details are frozen once the contract is approved, so
-- the document the client received cannot change afterwards. Additive only; no row is changed.
-- Reverse with db/rollback/019_contract_client_details.down.sql.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS client_details jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_client_details_object') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_client_details_object CHECK (jsonb_typeof(client_details) = 'object');
  END IF;
END $$;

-- Same guard as 015, with the client details frozen alongside the price.
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
