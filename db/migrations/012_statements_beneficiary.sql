-- Sankari Holding: Unified Systems Platform
-- Migration 012 - beneficiary on every charge, and the monthly subscriptions statement to accounting.
--
-- * subscription_bills.beneficiary: who the seat is for, copied from the subscription when the bill is
--   written, so a later edit never rewrites history. Existing bills keep '' (unknown).
-- * statement_credits: card payments and refunds, entered by an admin; append-only.
-- * monthly_statements: one row per month with its opening, charges, credits and closing (AED).
-- * email_outbox gains a 'held' state and attachments: the statement email waits until a person
--   presses Send; the worker never sends a held email.
-- Additive only. Reverse with db/rollback/012_statements_beneficiary.down.sql.

ALTER TABLE subscription_bills ADD COLUMN IF NOT EXISTS beneficiary text NOT NULL DEFAULT '';

ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_state_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_state_check CHECK (state IN ('pending', 'sending', 'sent', 'failed', 'held'));
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS attachments jsonb;

CREATE TABLE IF NOT EXISTS statement_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_on date NOT NULL,
  kind text NOT NULL CONSTRAINT statement_credits_kind_valid CHECK (kind IN ('payment', 'refund')),
  amount_aed_cents bigint NOT NULL CHECK (amount_aed_cents > 0),
  description text NOT NULL DEFAULT '',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS statement_credits_occurred_idx ON statement_credits(occurred_on);

CREATE OR REPLACE FUNCTION statement_credits_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payments and refunds are append-only; enter a correcting line instead' USING ERRCODE = 'check_violation';
END $$;
DROP TRIGGER IF EXISTS statement_credits_guard_trg ON statement_credits;
CREATE TRIGGER statement_credits_guard_trg BEFORE UPDATE OR DELETE ON statement_credits FOR EACH ROW EXECUTE FUNCTION statement_credits_guard();

CREATE TABLE IF NOT EXISTS monthly_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE CONSTRAINT monthly_statements_first_of_month CHECK (extract(day FROM month) = 1),
  opening_aed_cents bigint NOT NULL,
  charges_aed_cents bigint NOT NULL CHECK (charges_aed_cents >= 0),
  credits_aed_cents bigint NOT NULL CHECK (credits_aed_cents >= 0),
  closing_aed_cents bigint NOT NULL,
  lines integer NOT NULL CHECK (lines >= 0),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email_outbox_id uuid REFERENCES email_outbox(id) ON DELETE SET NULL,
  sent_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  CONSTRAINT monthly_statements_balances CHECK (closing_aed_cents = opening_aed_cents + charges_aed_cents - credits_aed_cents)
);

INSERT INTO settings(key, value) VALUES
  ('accounting', '{"recipientEmail":"","openingBalanceAedCents":"0","openingMonth":"2026-09"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
