-- Reverses db/migrations/015_contract_adjustment.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/015_contract_adjustment.down.sql
-- Refuses once any contract carries a discount or profit: its total would no longer explain itself.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM contracts WHERE adjustment_kind IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: contracts carry a discount or profit adjustment';
  END IF;
END $$;
-- Restore the 013 guard before dropping the columns it references.
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
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_list_total_nonneg;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_adjustment_valid;
ALTER TABLE contracts DROP COLUMN IF EXISTS list_total_cents;
ALTER TABLE contracts DROP COLUMN IF EXISTS discount_cents;
ALTER TABLE contracts DROP COLUMN IF EXISTS adjustment_bps;
ALTER TABLE contracts DROP COLUMN IF EXISTS adjustment_kind;
DELETE FROM schema_migrations WHERE filename = '015_contract_adjustment.sql';
COMMIT;
