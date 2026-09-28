-- Reverses db/migrations/012_statements_beneficiary.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/012_statements_beneficiary.down.sql
-- Refuses once any statement, payment/refund, held or attached email, or bill beneficiary exists.
BEGIN;
DO $$ DECLARE v_st bigint; v_cr bigint; v_mail bigint; v_ben bigint; v_set bigint; BEGIN
  SELECT count(*) INTO v_st FROM monthly_statements;
  SELECT count(*) INTO v_cr FROM statement_credits;
  SELECT count(*) INTO v_mail FROM email_outbox WHERE state = 'held' OR attachments IS NOT NULL;
  SELECT count(*) INTO v_ben FROM subscription_bills WHERE beneficiary <> '';
  SELECT count(*) INTO v_set FROM settings WHERE key = 'accounting' AND updated_by IS NOT NULL;
  IF v_st + v_cr + v_mail + v_ben + v_set > 0 THEN
    RAISE EXCEPTION 'rollback refused: statements=%, credits=%, held/attached emails=%, bills with beneficiary=%, accounting setting edited=%', v_st, v_cr, v_mail, v_ben, v_set;
  END IF;
END $$;
DROP TABLE IF EXISTS monthly_statements;
DROP TABLE IF EXISTS statement_credits;
DROP FUNCTION IF EXISTS statement_credits_guard();
DELETE FROM settings WHERE key = 'accounting';
ALTER TABLE email_outbox DROP COLUMN IF EXISTS attachments;
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_state_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_state_check CHECK (state IN ('pending', 'sending', 'sent', 'failed'));
ALTER TABLE subscription_bills DROP COLUMN IF EXISTS beneficiary;
DELETE FROM schema_migrations WHERE filename = '012_statements_beneficiary.sql';
COMMIT;
