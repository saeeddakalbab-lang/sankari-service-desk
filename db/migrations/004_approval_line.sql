-- Sankari Holding: Unified Systems Platform
-- Migration 004 - Employee -> Manager -> CEO approval line, card-number hardening,
-- OpsHub sample flag, exact installment split.
--
-- Additive only: no column is dropped, no existing row is rewritten.
-- Reverse with db/rollback/004_approval_line.down.sql.

-- ---------------------------------------------------------------------------
-- Users: CEO role, reporting line
-- ---------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant','ceo']::text[]);

-- Exactly zero or one active CEO; the approval line needs an unambiguous final approver.
CREATE UNIQUE INDEX IF NOT EXISTS users_single_active_ceo_idx ON users ((true))
  WHERE 'ceo' = ANY(roles) AND disabled_at IS NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_not_own_manager CHECK (manager_user_id IS NULL OR manager_user_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS users_manager_idx ON users(manager_user_id) WHERE manager_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Requests: approval line
-- ---------------------------------------------------------------------------
-- Existing rows default to false: they predate the approval line and keep their
-- current workflow. Nothing is inferred about who "would have" approved them.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
  step_no smallint NOT NULL CHECK (step_no >= 1),
  approver_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approver_role text NOT NULL CHECK (approver_role IN ('manager','ceo')),
  -- Snapshot at submission so a later rename/reorg never rewrites history.
  approver_name text NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','approved','rejected')),
  decided_at timestamptz,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_steps_order_unique UNIQUE (request_id, step_no),
  CONSTRAINT approval_steps_approver_once UNIQUE (request_id, approver_user_id),
  CONSTRAINT approval_steps_decided_has_time CHECK ((status = 'waiting') = (decided_at IS NULL)),
  CONSTRAINT approval_steps_reject_has_reason CHECK (status <> 'rejected' OR length(btrim(coalesce(comment,''))) > 0)
);
CREATE INDEX IF NOT EXISTS approval_steps_approver_idx ON approval_steps(approver_user_id, status);
CREATE INDEX IF NOT EXISTS approval_steps_request_idx ON approval_steps(request_id, step_no);

-- Guard every write to approval_steps.
CREATE OR REPLACE FUNCTION approval_steps_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_requester uuid;
  v_required boolean;
  v_blocking integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approval steps are permanent history and cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT requester_user_id, approval_required INTO v_requester, v_required FROM requests WHERE id = NEW.request_id;
  IF NOT coalesce(v_required, false) THEN
    RAISE EXCEPTION 'request % does not use the approval line', NEW.request_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_requester IS NOT NULL AND NEW.approver_user_id = v_requester THEN
    RAISE EXCEPTION 'a requester can never approve their own request' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'waiting' THEN
      RAISE EXCEPTION 'approval steps start as waiting' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: the chain itself is frozen at submission.
  IF NEW.request_id <> OLD.request_id OR NEW.step_no <> OLD.step_no
     OR NEW.approver_user_id <> OLD.approver_user_id OR NEW.approver_role <> OLD.approver_role
     OR NEW.approver_name <> OLD.approver_name THEN
    RAISE EXCEPTION 'the approval chain is fixed at submission and cannot be edited' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'waiting' THEN
    RAISE EXCEPTION 'an approval decision is final' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> 'waiting' THEN
    -- Sequential: every earlier step approved, nothing rejected anywhere.
    SELECT count(*) INTO v_blocking FROM approval_steps
     WHERE request_id = NEW.request_id AND id <> NEW.id
       AND ((step_no < NEW.step_no AND status <> 'approved') OR status = 'rejected');
    IF v_blocking > 0 THEN
      RAISE EXCEPTION 'this approval step is not the current step' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS approval_steps_guard_trg ON approval_steps;
CREATE TRIGGER approval_steps_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON approval_steps
  FOR EACH ROW EXECUTE FUNCTION approval_steps_guard();

-- The request status is DERIVED from approval_steps; this is the only writer of
-- the approval-phase statuses.
CREATE OR REPLACE FUNCTION derive_request_approval_status(p_request uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total integer;
  v_approved integer;
  v_rejected integer;
  v_status text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status = 'approved'), count(*) FILTER (WHERE status = 'rejected')
    INTO v_total, v_approved, v_rejected
    FROM approval_steps WHERE request_id = p_request;
  IF v_total = 0 THEN RETURN; END IF;
  v_status := CASE WHEN v_rejected > 0 THEN 'rejected'
                   WHEN v_approved = v_total THEN 'approved'
                   ELSE 'awaiting_approval' END;
  PERFORM set_config('sankari.approval_derivation', 'on', true);
  UPDATE requests
     SET status = v_status,
         resolved_at = CASE WHEN v_status = 'rejected' THEN coalesce(resolved_at, now()) ELSE resolved_at END,
         closed_at = CASE WHEN v_status = 'rejected' THEN coalesce(closed_at, now()) ELSE closed_at END,
         version = version + 1
   WHERE id = p_request AND status IS DISTINCT FROM v_status;
  PERFORM set_config('sankari.approval_derivation', 'off', true);
END $$;

CREATE OR REPLACE FUNCTION approval_steps_derive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM derive_request_approval_status(NEW.request_id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS approval_steps_derive_trg ON approval_steps;
CREATE TRIGGER approval_steps_derive_trg AFTER INSERT OR UPDATE ON approval_steps
  FOR EACH ROW EXECUTE FUNCTION approval_steps_derive();

-- Nobody - not the app, not an agent, not a psql session - can hand-set an
-- approval-phase status or fulfil a request before its approval line passes.
CREATE OR REPLACE FUNCTION requests_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_deriving boolean := coalesce(current_setting('sankari.approval_derivation', true), 'off') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_required AND NEW.status <> 'awaiting_approval' THEN
      RAISE EXCEPTION 'requests on the approval line start as awaiting_approval' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.approval_required <> NEW.approval_required THEN
    RAISE EXCEPTION 'approval_required is fixed at submission' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT NEW.approval_required OR v_deriving THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('awaiting_approval', 'approved', 'rejected') THEN
      RAISE EXCEPTION 'approval status is derived from approval_steps and cannot be set directly' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('awaiting_approval', 'rejected') THEN
      RAISE EXCEPTION 'request cannot move to fulfilment until every approver has approved' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD.status IN ('awaiting_approval', 'rejected') AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    RAISE EXCEPTION 'request cannot be assigned for fulfilment until every approver has approved' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS requests_approval_guard_trg ON requests;
CREATE TRIGGER requests_approval_guard_trg BEFORE INSERT OR UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION requests_approval_guard();

-- An approval-line request with no approvers would be an auto-approve hole.
CREATE OR REPLACE FUNCTION requests_have_approvers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_required AND NOT EXISTS (SELECT 1 FROM approval_steps WHERE request_id = NEW.id) THEN
    RAISE EXCEPTION 'request % is on the approval line but has no approval steps', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS requests_have_approvers_trg ON requests;
CREATE CONSTRAINT TRIGGER requests_have_approvers_trg AFTER INSERT ON requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION requests_have_approvers();

-- ---------------------------------------------------------------------------
-- Card data: last four digits only
-- ---------------------------------------------------------------------------
-- Strip non-digits on write, then refuse anything that is not exactly four
-- digits. The error deliberately does not echo the value, so a pasted PAN never
-- lands in the PostgreSQL log via a "Failing row contains" detail line. The
-- existing CHECK subscriptions_card_last4_only remains as the backstop.
CREATE OR REPLACE FUNCTION normalize_card_last4() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.card_last4 := regexp_replace(coalesce(NEW.card_last4, ''), '[^0-9]', '', 'g');
  IF NEW.card_last4 <> '' AND length(NEW.card_last4) <> 4 THEN
    RAISE EXCEPTION 'card_last4 must be exactly the last 4 digits of the card' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS subscriptions_card_last4_normalize ON subscriptions;
CREATE TRIGGER subscriptions_card_last4_normalize BEFORE INSERT OR UPDATE OF card_last4 ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION normalize_card_last4();

-- ---------------------------------------------------------------------------
-- OpsHub sample flag
-- ---------------------------------------------------------------------------
-- Nullable on purpose: NULL = not yet classified. The importer must set true or
-- false explicitly; existing rows are reported, never guessed.
ALTER TABLE companies            ADD COLUMN IF NOT EXISTS sample boolean;
ALTER TABLE services             ADD COLUMN IF NOT EXISTS sample boolean;
ALTER TABLE subscriptions        ADD COLUMN IF NOT EXISTS sample boolean;
ALTER TABLE purchase_requests    ADD COLUMN IF NOT EXISTS sample boolean;
ALTER TABLE contracts            ADD COLUMN IF NOT EXISTS sample boolean;
ALTER TABLE invoices             ADD COLUMN IF NOT EXISTS sample boolean;
ALTER TABLE payables             ADD COLUMN IF NOT EXISTS sample boolean;
ALTER TABLE ledger_entries       ADD COLUMN IF NOT EXISTS sample boolean;
ALTER TABLE contract_assignments ADD COLUMN IF NOT EXISTS sample boolean;

-- ---------------------------------------------------------------------------
-- Installments: exact integer split, final installment is the residual
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION installment_split(p_total bigint, p_first_bps integer, p_second_bps integer)
RETURNS TABLE(first_cents bigint, second_cents bigint, final_cents bigint)
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF p_total < 0 THEN RAISE EXCEPTION 'contract total cannot be negative'; END IF;
  IF p_first_bps < 0 OR p_second_bps < 0 OR p_first_bps + p_second_bps > 10000 THEN
    RAISE EXCEPTION 'installment shares must be between 0 and 10000 basis points in total';
  END IF;
  first_cents := (p_total * p_first_bps) / 10000;
  second_cents := (p_total * p_second_bps) / 10000;
  final_cents := p_total - first_cents - second_cents;
  RETURN NEXT;
END $$;

-- ---------------------------------------------------------------------------
-- Rollout switch: off until managers and the CEO are assigned in Settings.
-- ---------------------------------------------------------------------------
INSERT INTO settings(key, value) VALUES ('approvals', '{"enabled":false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
