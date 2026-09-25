-- Sankari Holding: Unified Systems Platform
-- Migration 010 - subscription renewals and bill history.
--
-- A renewal only goes ahead when the subscription's owner says so. The worker reminds the owner
-- ahead of the renewal date; "renew" writes a bill, "decline" cancels at term end, and no answer by
-- the renewal date flags the subscription and charges nothing. There is no automatic renewal: the
-- database refuses a renewal bill without an owner's recorded "renew".
--
-- Additive only: new columns default to NULL/'' and no existing row changes. auto_renew is left
-- as it is; nothing reads it any more. Reverse with db/rollback/010_renewals_bills.down.sql.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES requests(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at date;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_flagged_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_per_request_idx ON subscriptions(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_owner_idx ON subscriptions(owner_user_id);

-- One row per renewal date of a subscription: when the owner was reminded and what they decided.
CREATE TABLE IF NOT EXISTS subscription_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  renewal_date date NOT NULL,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reminded_at timestamptz NOT NULL DEFAULT now(),
  decision text CONSTRAINT subscription_renewals_decision_valid CHECK (decision IN ('renew', 'decline')),
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '',
  flagged_at timestamptz,
  UNIQUE (subscription_id, renewal_date),
  CONSTRAINT subscription_renewals_decision_complete CHECK ((decision IS NULL) = (decided_at IS NULL) AND (decision IS NULL OR decided_by_user_id IS NOT NULL))
);

-- A decision is final, and nobody may decide for the owner.
CREATE OR REPLACE FUNCTION subscription_renewals_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subscription_id <> OLD.subscription_id OR NEW.renewal_date <> OLD.renewal_date THEN
    RAISE EXCEPTION 'a renewal row cannot be moved to another subscription or date' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.decision IS NOT NULL AND (NEW.decision IS DISTINCT FROM OLD.decision OR NEW.decided_by_user_id IS DISTINCT FROM OLD.decided_by_user_id OR NEW.decided_at IS DISTINCT FROM OLD.decided_at) THEN
    RAISE EXCEPTION 'a renewal decision is final' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.decision IS NULL AND NEW.decision IS NOT NULL AND NEW.decided_by_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'only the subscription owner can decide its renewal' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.flagged_at IS NOT NULL AND NEW.flagged_at IS NULL THEN
    RAISE EXCEPTION 'a missed renewal stays on record' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.flagged_at IS NOT NULL AND OLD.flagged_at IS NULL AND (OLD.decision IS NOT NULL OR NEW.renewal_date >= current_date) THEN
    RAISE EXCEPTION 'only an unanswered renewal past its date can be flagged' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS subscription_renewals_guard_trg ON subscription_renewals;
CREATE TRIGGER subscription_renewals_guard_trg BEFORE UPDATE ON subscription_renewals FOR EACH ROW EXECUTE FUNCTION subscription_renewals_guard();

-- Every charge. Amounts are integer minor units; the AED rate is frozen on the row.
CREATE TABLE IF NOT EXISTS subscription_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  kind text NOT NULL CONSTRAINT subscription_bills_kind_valid CHECK (kind IN ('initial', 'renewal')),
  renewal_id uuid UNIQUE REFERENCES subscription_renewals(id) ON DELETE RESTRICT,
  request_id uuid REFERENCES requests(id) ON DELETE SET NULL,
  billed_on date NOT NULL DEFAULT current_date,
  period_start date,
  period_end date,
  tool text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  usd_to_aed_rate numeric(12,6) NOT NULL CHECK (usd_to_aed_rate > 0),
  amount_aed_cents bigint NOT NULL CHECK (amount_aed_cents >= 0),
  card_last4 text NOT NULL DEFAULT '' CONSTRAINT subscription_bills_card_last4_only CHECK (card_last4 = '' OR card_last4 ~ '^[0-9]{4}$'),
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_bills_kind_shape CHECK ((kind = 'renewal') = (renewal_id IS NOT NULL)),
  CONSTRAINT subscription_bills_initial_has_request CHECK (kind <> 'initial' OR request_id IS NOT NULL),
  CONSTRAINT subscription_bills_aed_matches CHECK (currency <> 'AED' OR amount_aed_cents = amount_cents)
);
-- Same card rule as subscriptions (migration 004): a raw card number is refused with a message that
-- does not echo it, before the CHECK backstop could print the failing row.
DROP TRIGGER IF EXISTS subscription_bills_card_last4_normalize ON subscription_bills;
CREATE TRIGGER subscription_bills_card_last4_normalize BEFORE INSERT ON subscription_bills
  FOR EACH ROW EXECUTE FUNCTION normalize_card_last4();
CREATE UNIQUE INDEX IF NOT EXISTS subscription_bills_one_initial_idx ON subscription_bills(subscription_id) WHERE kind = 'initial';
CREATE INDEX IF NOT EXISTS subscription_bills_billed_idx ON subscription_bills(billed_on DESC);

-- A bill is history: it cannot be edited or removed, and a renewal bill needs the owner's "renew".
CREATE OR REPLACE FUNCTION subscription_bills_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_decision text; v_sub uuid; v_type text; v_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'bills are append-only' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'renewal' THEN
    SELECT decision, subscription_id INTO v_decision, v_sub FROM subscription_renewals WHERE id = NEW.renewal_id;
    IF v_decision IS DISTINCT FROM 'renew' OR v_sub <> NEW.subscription_id THEN
      RAISE EXCEPTION 'a renewal bill needs the owner''s recorded decision to renew' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT type, status INTO v_type, v_status FROM requests WHERE id = NEW.request_id;
    IF v_type IS DISTINCT FROM 'subscription_approval' OR v_status IN ('awaiting_approval', 'rejected', 'cancelled') THEN
      RAISE EXCEPTION 'a first bill needs an approved subscription request' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS subscription_bills_guard_trg ON subscription_bills;
CREATE TRIGGER subscription_bills_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON subscription_bills FOR EACH ROW EXECUTE FUNCTION subscription_bills_guard();
