-- Sankari Holding: Unified Systems Platform
-- Migration 018 - close two NULL holes in the checks added by 014 and 015.
--
-- A CHECK passes when it evaluates to NULL. So "weeks with no days" and "a percentage with no kind"
-- slipped through: (weeks BETWEEN 1 AND 4 AND days BETWEEN 1 AND 7) is NULL when days is NULL, and
-- (kind = 'discount' ...) is NULL when kind is NULL. The CI guard run found both. Each check is
-- rewritten so every branch is TRUE or FALSE, never NULL.
-- If an existing row already breaks the stricter rule, this stops and names the rows; it never
-- changes data to make the constraint fit. No row is changed.
-- Reverse with db/rollback/018_tighten_contract_checks.down.sql.

DO $$
DECLARE bad_lines text; bad_contracts text;
BEGIN
  SELECT string_agg(id::text, ', ') INTO bad_lines FROM contract_line_items
   WHERE (weeks_per_month IS NULL) <> (days_per_week IS NULL);
  IF bad_lines IS NOT NULL THEN
    RAISE EXCEPTION 'contract lines with weeks but no days (or days but no weeks): %', bad_lines;
  END IF;
  SELECT string_agg(reference, ', ') INTO bad_contracts FROM contracts
   WHERE adjustment_kind IS NULL AND (adjustment_bps <> 0 OR discount_cents <> 0);
  IF bad_contracts IS NOT NULL THEN
    RAISE EXCEPTION 'contracts with a percentage or discount but no kind: %', bad_contracts;
  END IF;
END $$;

ALTER TABLE contract_line_items DROP CONSTRAINT IF EXISTS contract_lines_weeks_valid;
ALTER TABLE contract_line_items ADD CONSTRAINT contract_lines_weeks_valid CHECK (
  (weeks_per_month IS NULL AND days_per_week IS NULL)
  OR (weeks_per_month IS NOT NULL AND days_per_week IS NOT NULL AND weeks_per_month BETWEEN 1 AND 4 AND days_per_week BETWEEN 1 AND 7));

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_adjustment_valid;
ALTER TABLE contracts ADD CONSTRAINT contracts_adjustment_valid CHECK (
  (adjustment_kind IS NULL AND adjustment_bps = 0 AND discount_cents = 0)
  OR (adjustment_kind IS NOT NULL AND adjustment_kind = 'discount' AND adjustment_bps BETWEEN 1 AND 9000 AND discount_cents >= 0)
  OR (adjustment_kind IS NOT NULL AND adjustment_kind = 'markup' AND adjustment_bps BETWEEN 1 AND 20000 AND discount_cents = 0));
