-- Sankari Holding: Unified Systems Platform
-- Migration 011 - a frozen to-AED rate on subscriptions billed in other currencies.
--
-- Subscriptions recorded from a portal request are USD or AED and take the rate frozen on the request.
-- Existing subscriptions imported from a card statement are billed in EUR, CHF, GBP or TRY; their
-- rate to AED is taken from the bank's conversion on the statement and frozen here, so a renewal bill
-- converts at a known rate instead of guessing. Additive only: a nullable column, no row changes.
-- Reverse with db/rollback/011_subscription_aed_rate.down.sql.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS aed_rate numeric(12,6)
  CONSTRAINT subscriptions_aed_rate_positive CHECK (aed_rate IS NULL OR aed_rate > 0);
