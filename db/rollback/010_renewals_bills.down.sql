-- Reverses db/migrations/010_renewals_bills.sql. Run by hand only:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/010_renewals_bills.down.sql
-- Refuses once any bill or renewal exists, or any subscription has been given an owner, request,
-- company or cancellation date: those are money and decisions, and must be exported first.
BEGIN;
DO $$ DECLARE v_bills bigint; v_renewals bigint; v_subs bigint; BEGIN
  SELECT count(*) INTO v_bills FROM subscription_bills;
  SELECT count(*) INTO v_renewals FROM subscription_renewals;
  SELECT count(*) INTO v_subs FROM subscriptions
    WHERE owner_user_id IS NOT NULL OR request_id IS NOT NULL OR company_name <> '' OR cancel_at IS NOT NULL OR renewal_flagged_at IS NOT NULL;
  IF v_bills + v_renewals + v_subs > 0 THEN
    RAISE EXCEPTION 'rollback refused: bills=%, renewals=%, subscriptions using the new columns=%', v_bills, v_renewals, v_subs;
  END IF;
END $$;
DROP TABLE IF EXISTS subscription_bills;
DROP FUNCTION IF EXISTS subscription_bills_guard();
DROP TABLE IF EXISTS subscription_renewals;
DROP FUNCTION IF EXISTS subscription_renewals_guard();
DROP INDEX IF EXISTS subscriptions_owner_idx;
DROP INDEX IF EXISTS subscriptions_one_per_request_idx;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS renewal_flagged_at;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS cancel_at;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS company_name;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS request_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS owner_user_id;
DELETE FROM schema_migrations WHERE filename = '010_renewals_bills.sql';
COMMIT;
