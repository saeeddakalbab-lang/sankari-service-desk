-- Sankari Holding: Unified Systems Platform
-- Migration 009 - one-time Start / Reject links in the new-ticket email.
--
-- Only an HMAC of each token is stored, never the token itself. A link is bound to the person it
-- was emailed to, expires, and can be used once. Additive only: a new table, no existing row changes.
-- Reverse with db/rollback/009_ticket_actions.down.sql.

CREATE TABLE IF NOT EXISTS action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CONSTRAINT action_tokens_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CONSTRAINT action_tokens_action_valid CHECK (action IN ('ticket.start', 'ticket.reject')),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT action_tokens_expiry_after_issue CHECK (expires_at > created_at),
  CONSTRAINT action_tokens_used_complete CHECK ((used_at IS NULL) = (used_by_user_id IS NULL)),
  CONSTRAINT action_tokens_used_by_recipient CHECK (used_by_user_id IS NULL OR used_by_user_id = recipient_user_id)
);
CREATE INDEX IF NOT EXISTS action_tokens_request_idx ON action_tokens(request_id);

-- A used link stays used: nothing may clear used_at or change what a token points at.
CREATE OR REPLACE FUNCTION action_tokens_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.token_hash <> OLD.token_hash OR NEW.action <> OLD.action OR NEW.request_id <> OLD.request_id
     OR NEW.recipient_user_id <> OLD.recipient_user_id OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'action tokens are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'action token already used' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.used_at IS NOT NULL AND OLD.expires_at <= now() THEN
    RAISE EXCEPTION 'action token expired' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS action_tokens_guard_trg ON action_tokens;
CREATE TRIGGER action_tokens_guard_trg BEFORE UPDATE ON action_tokens FOR EACH ROW EXECUTE FUNCTION action_tokens_guard();
