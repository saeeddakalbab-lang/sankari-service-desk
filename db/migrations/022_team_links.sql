-- Sankari Holding: Unified Systems Platform
-- Migration 022 - people name their manager, managers name their team; a match links them.
--
-- * users.manager_claim_email / _name / _at: who this person says their manager is.
-- * team_claims: the people a manager says report to them (by email, so they can be added before
--   they first sign in).
-- An employee is placed under a manager only when BOTH sides name each other, whichever comes first;
-- the application then sets users.manager_user_id (the manager is the first approver on that
-- person's subscription requests, so nobody picks their own approver alone). Admins still set
-- managers directly in People. Additive only: new columns with NULL, a new table; no row changes.
-- Reverse with db/rollback/022_team_links.down.sql.

ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_claim_email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_claim_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_claim_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_manager_claim_valid') THEN
    ALTER TABLE users ADD CONSTRAINT users_manager_claim_valid CHECK (
      manager_claim_email IS NULL OR (manager_claim_email = lower(manager_claim_email) AND length(manager_claim_email) <= 254
        AND manager_claim_email ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$' AND manager_claim_email <> lower(email)));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS team_claims (
  manager_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_email text NOT NULL CHECK (employee_email = lower(employee_email) AND length(employee_email) <= 254 AND employee_email ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  matched_at timestamptz,
  PRIMARY KEY (manager_user_id, employee_email)
);
CREATE INDEX IF NOT EXISTS team_claims_employee_idx ON team_claims(employee_email);
