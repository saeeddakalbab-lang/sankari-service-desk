-- Sankari Holding: Unified Systems Platform
-- Migration 021 - who a scheduled report appears to come from.
--
-- The portal sends every email through its one SMTP mailbox, so it cannot send as another person's
-- address. A report can instead carry the chosen sender's name as the display name and their address
-- as Reply-To, so replies reach them. Two nullable columns; every existing email keeps NULL and
-- sends exactly as before. Additive only; no row is changed.
-- Reverse with db/rollback/021_email_sender.down.sql.

ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS from_name text;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS reply_to text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_outbox_sender_valid') THEN
    ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_sender_valid CHECK (
      (from_name IS NULL OR (length(from_name) BETWEEN 1 AND 120 AND from_name !~ '[<>"\r\n]'))
      AND (reply_to IS NULL OR (length(reply_to) <= 254 AND reply_to ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$')));
  END IF;
END $$;
