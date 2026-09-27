-- Sankari Holding: Unified Systems Platform
-- Migration 015 - a discount or a profit percentage on a contract, set at review.
--
-- * discount: shown to the client as its own line; total = services + onsite premium - discount.
-- * markup (profit): raises each service's monthly price; the client only sees the final prices.
--   list_total_cents keeps the price before the adjustment, for admins only.
-- Both can change only while the contract is submitted or under review; the guard freezes them with
-- the price once it is approved. Additive only: four columns with safe defaults; no row changes.
-- Reverse with db/rollback/015_contract_adjustment.down.sql.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS adjustment_kind text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS adjustment_bps integer NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS discount_cents bigint NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS list_total_cents bigint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_adjustment_valid') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_adjustment_valid CHECK (
      (adjustment_kind IS NULL AND adjustment_bps = 0 AND discount_cents = 0)
      OR (adjustment_kind = 'discount' AND adjustment_bps BETWEEN 1 AND 9000 AND discount_cents >= 0)
      OR (adjustment_kind = 'markup' AND adjustment_bps BETWEEN 1 AND 20000 AND discount_cents = 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_list_total_nonneg') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_list_total_nonneg CHECK (list_total_cents IS NULL OR list_total_cents >= 0);
  END IF;
END $$;

-- Same guard as 013, with the adjustment frozen alongside the price.
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
    OR NEW.discount_cents <> OLD.discount_cents OR NEW.list_total_cents IS DISTINCT FROM OLD.list_total_cents) THEN
    RAISE EXCEPTION 'an approved contract''s price and parties are fixed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
