-- Reverses db/migrations/021_email_sender.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/021_email_sender.down.sql
-- The columns only name a display sender and a Reply-To; dropping them loses that for emails
-- already sent, which the audit log also records. Refuses while any email is still waiting to go.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM email_outbox WHERE (from_name IS NOT NULL OR reply_to IS NOT NULL) AND state IN ('pending','sending','failed','held')) THEN
    RAISE EXCEPTION 'rollback refused: emails with a chosen sender are still waiting to be sent';
  END IF;
END $$;
ALTER TABLE email_outbox DROP CONSTRAINT IF EXISTS email_outbox_sender_valid;
ALTER TABLE email_outbox DROP COLUMN IF EXISTS reply_to;
ALTER TABLE email_outbox DROP COLUMN IF EXISTS from_name;
DELETE FROM schema_migrations WHERE filename = '021_email_sender.sql';
COMMIT;
