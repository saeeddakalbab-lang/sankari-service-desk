-- Sankari Holding: Unified Systems Platform
-- Migration 007 - skipping an approver who has not answered.
--
-- A person (Owner, CEO or Board member) may skip the CURRENT step once it has waited
-- longer than rules.skipAfterHours, with a reason. The system never skips by itself.
-- Additive: one new status value and two nullable columns. Existing rows are untouched.
-- Reverse with db/rollback/007_approval_skip.down.sql.

ALTER TABLE approval_steps DROP CONSTRAINT IF EXISTS approval_steps_status_check;
ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_status_check
  CHECK (status IN ('waiting','approved','rejected','skipped'));
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS skipped_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS skip_reason text;
DO $$ BEGIN
  ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_skip_complete CHECK (
    (status = 'skipped' AND skipped_by_user_id IS NOT NULL AND length(btrim(coalesce(skip_reason,''))) > 0)
    OR (status <> 'skipped' AND skipped_by_user_id IS NULL AND skip_reason IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION approval_steps_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_requester uuid;
  v_required boolean;
  v_created timestamptz;
  v_blocking integer;
  v_since timestamptz;
  v_hours integer;
  v_skipper_roles text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approval steps are permanent history and cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT requester_user_id, approval_required, created_at INTO v_requester, v_required, v_created FROM requests WHERE id = NEW.request_id;
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

  IF NEW.request_id <> OLD.request_id OR NEW.step_no <> OLD.step_no
     OR NEW.approver_user_id <> OLD.approver_user_id OR NEW.approver_role <> OLD.approver_role
     OR NEW.approver_name <> OLD.approver_name THEN
    RAISE EXCEPTION 'the approval chain is fixed at submission and cannot be edited' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'waiting' THEN
    RAISE EXCEPTION 'an approval decision is final' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'waiting' THEN RETURN NEW; END IF;

  -- Sequential: every earlier step approved or skipped, nothing rejected anywhere.
  SELECT count(*) INTO v_blocking FROM approval_steps
   WHERE request_id = NEW.request_id AND id <> NEW.id
     AND ((step_no < NEW.step_no AND status NOT IN ('approved','skipped')) OR status = 'rejected');
  IF v_blocking > 0 THEN
    RAISE EXCEPTION 'this approval step is not the current step' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'skipped' THEN
    SELECT roles INTO v_skipper_roles FROM users WHERE id = NEW.skipped_by_user_id AND disabled_at IS NULL;
    IF v_skipper_roles IS NULL OR NOT (v_skipper_roles && ARRAY['owner','ceo','board']) THEN
      RAISE EXCEPTION 'only the Owner, the CEO or a Board member can skip an approver' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.skipped_by_user_id = v_requester THEN
      RAISE EXCEPTION 'a requester can never skip a step on their own request' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.skipped_by_user_id = NEW.approver_user_id THEN
      RAISE EXCEPTION 'the approver of a step decides it; they cannot skip it' USING ERRCODE = 'check_violation';
    END IF;
    SELECT decided_at INTO v_since FROM approval_steps WHERE request_id = NEW.request_id AND step_no = NEW.step_no - 1;
    v_since := coalesce(v_since, v_created);
    SELECT coalesce((value->>'skipAfterHours')::integer, 48) INTO v_hours FROM settings WHERE key = 'rules';
    v_hours := coalesce(v_hours, 48);
    IF now() - v_since < make_interval(hours => v_hours) THEN
      RAISE EXCEPTION 'this step can be skipped only after % hours without an answer', v_hours USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- A skipped step counts as passed when deriving the request status.
CREATE OR REPLACE FUNCTION derive_request_approval_status(p_request uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total integer;
  v_passed integer;
  v_rejected integer;
  v_status text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status IN ('approved','skipped')), count(*) FILTER (WHERE status = 'rejected')
    INTO v_total, v_passed, v_rejected
    FROM approval_steps WHERE request_id = p_request;
  IF v_total = 0 THEN RETURN; END IF;
  v_status := CASE WHEN v_rejected > 0 THEN 'rejected'
                   WHEN v_passed = v_total THEN 'approved'
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
