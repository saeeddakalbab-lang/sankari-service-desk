-- Sankari Holding: Unified Systems Platform
-- Migration 014 - contract lines priced by weeks on site.
--
-- A consultant in the mall for six months may work only two weeks of each month. A line now records
-- the weeks per month (1-4) and the days per week (1-7) it was priced on; hours_per_month stays the
-- product at 8 hours a day, so every existing total and report keeps working.
-- Additive only: two nullable columns. Lines saved before this keep NULL and show their hours.
-- Reverse with db/rollback/014_contract_weeks.down.sql.

ALTER TABLE contract_line_items ADD COLUMN IF NOT EXISTS weeks_per_month smallint;
ALTER TABLE contract_line_items ADD COLUMN IF NOT EXISTS days_per_week smallint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_lines_weeks_valid') THEN
    ALTER TABLE contract_line_items ADD CONSTRAINT contract_lines_weeks_valid CHECK (
      (weeks_per_month IS NULL AND days_per_week IS NULL)
      OR (weeks_per_month BETWEEN 1 AND 4 AND days_per_week BETWEEN 1 AND 7));
  END IF;
END $$;
