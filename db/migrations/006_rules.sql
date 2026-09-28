-- Sankari Holding: Unified Systems Platform
-- Migration 006 - one admin-editable Rules record for what the system decides by.
--
-- Values are today's behaviour, so nothing changes on deploy. Additive only.
-- Reverse with db/rollback/006_rules.down.sql.

INSERT INTO settings(key, value) VALUES ('rules', '{
  "slaHours": {"urgent": 4, "high": 24, "medium": 72, "low": 120},
  "skipAfterHours": 48,
  "renewalLeadDays": 14,
  "approvalTypes": ["subscription_approval"],
  "notifications": {"toast": true, "emailAdminOnTicket": true, "emailApprover": true}
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
