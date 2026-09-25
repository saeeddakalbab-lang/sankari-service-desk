-- Reverses db/migrations/011_subscription_aed_rate.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/011_subscription_aed_rate.down.sql
-- Refuses once any subscription has a rate: those renewals would lose their conversion.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM subscriptions WHERE aed_rate IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback refused: subscriptions carry a frozen AED rate';
  END IF;
END $$;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS aed_rate;
DELETE FROM schema_migrations WHERE filename = '011_subscription_aed_rate.sql';
COMMIT;
