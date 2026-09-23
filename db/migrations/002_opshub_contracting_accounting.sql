-- Sankari Holding: Unified Systems Platform
-- Migration 002 - OpsHub port, contracting, pricing, and accounting schema.
--
-- This extends the working NextAuth/request platform from 001_initial.sql.
-- Money uses BIGINT minor units. Percentages use integer basis points.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_valid;
ALTER TABLE users ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['employee','agent','admin','board','dev','accountant']::text[]);

DO $$ BEGIN
  CREATE TYPE billing_cycle AS ENUM ('one_off', 'monthly', 'quarterly', 'annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE company_status AS ENUM ('active', 'prospect', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE pricing_model AS ENUM ('monthly', 'annual', 'fixed', 'hourly', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'renewal_due', 'awaiting_approval', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('corporate_card', 'bank_transfer', 'online_payment', 'cheque', 'cash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE purchase_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'ordered', 'received', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE support_type AS ENUM ('onsite', 'remote');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM ('submitted', 'under_review', 'approved', 'rejected', 'contract_sent', 'signed', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE installment_kind AS ENUM ('signing', 'midpoint', 'final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('pending', 'sent', 'paid', 'overdue', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE ledger_direction AS ENUM ('inflow', 'outflow');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE ledger_source AS ENUM ('receivable', 'tool_bill', 'payroll', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  legal_name text NOT NULL DEFAULT '',
  company_type text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  vat_number text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  contact_position text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  billing_contact text NOT NULL DEFAULT '',
  technical_contact text NOT NULL DEFAULT '',
  logo_asset_id text,
  notes text NOT NULL DEFAULT '',
  status company_status NOT NULL DEFAULT 'prospect',
  import_source text,
  import_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_import_unique_idx ON companies(import_source, import_id)
  WHERE import_source IS NOT NULL AND import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_status_idx ON companies(status);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key text UNIQUE NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  model pricing_model NOT NULL DEFAULT 'monthly',
  default_price_cents bigint NOT NULL DEFAULT 0 CHECK (default_price_cents >= 0),
  currency text NOT NULL DEFAULT 'AED',
  tax_rate_bps integer NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  billing_frequency text NOT NULL DEFAULT '',
  sla text NOT NULL DEFAULT '',
  deliverables text NOT NULL DEFAULT '',
  team text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL DEFAULT '',
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  department text NOT NULL DEFAULT '',
  beneficiary text NOT NULL DEFAULT '',
  account_email text NOT NULL DEFAULT '',
  start_date date,
  renewal_date date,
  expiration_date date,
  billing_frequency billing_cycle NOT NULL DEFAULT 'annual',
  amount_cents bigint NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'AED',
  method payment_method,
  card_last4 text NOT NULL DEFAULT ''
    CONSTRAINT subscriptions_card_last4_only CHECK (card_last4 = '' OR card_last4 ~ '^[0-9]{4}$'),
  auto_renew boolean NOT NULL DEFAULT false,
  responsible text NOT NULL DEFAULT '',
  approval_ref text NOT NULL DEFAULT '',
  attachment_asset_id text,
  calendar_event_id text,
  status subscription_status NOT NULL DEFAULT 'active',
  notes text NOT NULL DEFAULT '',
  import_source text,
  import_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_import_unique_idx ON subscriptions(import_source, import_id)
  WHERE import_source IS NOT NULL AND import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_renewal_idx ON subscriptions(renewal_date)
  WHERE status IN ('active', 'renewal_due', 'awaiting_approval');

CREATE TABLE IF NOT EXISTS purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_name text NOT NULL DEFAULT '',
  item text NOT NULL,
  justification text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount_cents bigint NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'AED',
  vendor text NOT NULL DEFAULT '',
  status purchase_status NOT NULL DEFAULT 'submitted',
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text NOT NULL DEFAULT '',
  import_source text,
  import_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_import_unique_idx ON purchase_requests(import_source, import_id)
  WHERE import_source IS NOT NULL AND import_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  support_type support_type NOT NULL,
  requested_start_date date NOT NULL,
  duration_months integer NOT NULL CHECK (duration_months > 0),
  currency text NOT NULL DEFAULT 'USD',
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  onsite_premium_cents bigint NOT NULL DEFAULT 0 CHECK (onsite_premium_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  pricing_snapshot jsonb NOT NULL,
  status contract_status NOT NULL DEFAULT 'submitted',
  start_date date,
  end_date date,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  contract_sent_at timestamptz,
  signed_at timestamptz,
  signed_evidence text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts(status);
CREATE INDEX IF NOT EXISTS contracts_company_idx ON contracts(company_name);

CREATE TABLE IF NOT EXISTS contract_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  service_label text NOT NULL,
  hours_per_month integer NOT NULL CHECK (hours_per_month > 0),
  base_salary_cents bigint NOT NULL,
  flat_cost_cents bigint NOT NULL,
  multiplier integer NOT NULL,
  standard_hours integer NOT NULL,
  monthly_full_time_cents bigint NOT NULL,
  monthly_price_cents bigint NOT NULL,
  line_total_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_lines_contract_idx ON contract_line_items(contract_id);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  reference text UNIQUE NOT NULL,
  installment installment_kind NOT NULL,
  share_bps integer NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  due_trigger text NOT NULL,
  due_date date,
  status invoice_status NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  paid_at timestamptz,
  paid_amount_cents bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_one_per_installment UNIQUE (contract_id, installment)
);
CREATE INDEX IF NOT EXISTS invoices_status_due_idx ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS invoices_contract_idx ON invoices(contract_id);

CREATE OR REPLACE FUNCTION check_invoice_sum() RETURNS trigger AS $$
DECLARE
  v_contract_id uuid;
  v_total bigint;
  v_sum bigint;
  v_count integer;
BEGIN
  v_contract_id := COALESCE(NEW.contract_id, OLD.contract_id);

  SELECT total_cents INTO v_total FROM contracts WHERE id = v_contract_id;
  SELECT COALESCE(SUM(amount_cents), 0), COUNT(*)
    INTO v_sum, v_count
    FROM invoices
   WHERE contract_id = v_contract_id AND status <> 'void';

  IF v_count > 0 AND v_count = 3 AND v_sum <> v_total THEN
    RAISE EXCEPTION
      'invoice amounts (% cents) do not sum to contract total (% cents) for contract %',
      v_sum, v_total, v_contract_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_sum_matches_contract ON invoices;
CREATE CONSTRAINT TRIGGER invoices_sum_matches_contract
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_invoice_sum();

CREATE TABLE IF NOT EXISTS payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source ledger_source NOT NULL CHECK (source <> 'receivable'),
  vendor text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  cycle billing_cycle NOT NULL DEFAULT 'monthly',
  next_due_date date,
  is_active boolean NOT NULL DEFAULT true,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  service_key text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payables_due_idx ON payables(next_due_date) WHERE is_active;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction ledger_direction NOT NULL,
  source ledger_source NOT NULL,
  occurred_on date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  payable_id uuid REFERENCES payables(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_direction_matches_source CHECK (
    (direction = 'inflow' AND source = 'receivable') OR
    (direction = 'outflow' AND source <> 'receivable')
  ),
  CONSTRAINT ledger_one_per_invoice UNIQUE (invoice_id)
);
CREATE INDEX IF NOT EXISTS ledger_occurred_idx ON ledger_entries(occurred_on DESC);
CREATE INDEX IF NOT EXISTS ledger_contract_idx ON ledger_entries(contract_id);

CREATE TABLE IF NOT EXISTS contract_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  staff_name text NOT NULL DEFAULT '',
  service_key text NOT NULL,
  monthly_cost_cents bigint NOT NULL CHECK (monthly_cost_cents >= 0),
  started_on date NOT NULL,
  ended_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_assignments_contract_idx ON contract_assignments(contract_id);

DROP TRIGGER IF EXISTS companies_touch ON companies;
CREATE TRIGGER companies_touch BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS services_touch ON services;
CREATE TRIGGER services_touch BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS subscriptions_touch ON subscriptions;
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS purchases_touch ON purchase_requests;
CREATE TRIGGER purchases_touch BEFORE UPDATE ON purchase_requests FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS settings_touch ON settings;
CREATE TRIGGER settings_touch BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS contracts_touch ON contracts;
CREATE TRIGGER contracts_touch BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS payables_touch ON payables;
CREATE TRIGGER payables_touch BEFORE UPDATE ON payables FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO settings(key, value) VALUES
  ('pricing', '{
    "currency":"USD",
    "standardHours":160,
    "flatCostCents":100000,
    "multiplier":3,
    "onsitePremiumBps":0,
    "services":{
      "consultant":{"label":"Consultant","baseSalaryCents":250000},
      "it_support":{"label":"IT Support Specialist","baseSalaryCents":100000},
      "devops":{"label":"DevOps","baseSalaryCents":100000},
      "cybersecurity":{"label":"Cybersecurity","baseSalaryCents":100000}
    }
  }'::jsonb),
  ('installments', '{"signingBps":5000,"midpointBps":2500,"finalBps":2500}'::jsonb),
  ('currency', '{"reportingCurrency":"AED","usdToAedRate":"3.6725","mode":"freeze_per_record"}'::jsonb),
  ('migration', '{"opshubSampleFilter":"sample_true_excluded","preserveExistingContractValues":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
