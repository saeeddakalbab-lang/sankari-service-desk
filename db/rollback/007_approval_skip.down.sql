-- Reverses db/migrations/007_approval_skip.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/007_approval_skip.down.sql
-- Refuses once any step has been skipped: those decisions are history and must not be dropped.
-- Restores the guard and derive functions exactly as migration 004 defined them.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM approval_steps WHERE status = 'skipped' OR skipped_by_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: skipped approval steps exist';
  END IF;
END $$;

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

ALTER TABLE approval_steps DROP CONSTRAINT IF EXISTS approval_steps_skip_complete;
ALTER TABLE approval_steps DROP COLUMN IF EXISTS skip_reason;
ALTER TABLE approval_steps DROP COLUMN IF EXISTS skipped_by_user_id;
ALTER TABLE approval_steps DROP CONSTRAINT IF EXISTS approval_steps_status_check;
ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_status_check CHECK (status IN ('waiting','approved','rejected'));
DELETE FROM schema_migrations WHERE filename = '007_approval_skip.sql';
COMMIT;
