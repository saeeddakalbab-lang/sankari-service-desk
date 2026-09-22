CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE request_type AS ENUM ('subscription_approval','helpdesk_ticket','email_account_request');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE request_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  image text,
  email_verified timestamptz,
  roles text[] NOT NULL DEFAULT ARRAY['employee']::text[],
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email = lower(email)),
  CONSTRAINT users_roles_valid CHECK (roles <@ ARRAY['employee','agent','admin','board','dev']::text[])
);

CREATE TABLE IF NOT EXISTS accounts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  session_token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier text NOT NULL,
  token text NOT NULL,
  expires timestamptz NOT NULL,
  PRIMARY KEY(identifier, token)
);

CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type request_type NOT NULL,
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  department text NOT NULL,
  company text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  priority request_priority NOT NULL DEFAULT 'medium',
  status text NOT NULL,
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sla_due_at timestamptz NOT NULL,
  assigned_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_source text,
  import_id text,
  import_url text,
  version integer NOT NULL DEFAULT 1
);
ALTER TABLE requests DROP CONSTRAINT IF EXISTS request_import_unique;
CREATE UNIQUE INDEX IF NOT EXISTS requests_import_unique_idx ON requests(import_source,import_id) WHERE import_source IS NOT NULL AND import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS requests_owner_idx ON requests(requester_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_queue_idx ON requests(type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_sla_idx ON requests(sla_due_at) WHERE resolved_at IS NULL AND closed_at IS NULL;
CREATE INDEX IF NOT EXISTS requests_details_idx ON requests USING gin(details);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_request_idx ON comments(request_id, created_at);

CREATE TABLE IF NOT EXISTS agents (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type request_type NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, request_type)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  request_id uuid REFERENCES requests(id) ON DELETE SET NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_request_idx ON audit_log(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  request_id uuid REFERENCES requests(id) ON DELETE SET NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text_body text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_pending_idx ON email_outbox(state, next_attempt_at);

CREATE TABLE IF NOT EXISTS jira_issues (
  issue_key text PRIMARY KEY,
  project_key text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL,
  status_category text NOT NULL,
  assignee_email text,
  assignee_name text,
  priority text,
  due_date date,
  issue_url text NOT NULL,
  raw jsonb NOT NULL,
  jira_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jira_project_idx ON jira_issues(project_key, status_category);
CREATE INDEX IF NOT EXISTS jira_assignee_idx ON jira_issues(assignee_email);

CREATE TABLE IF NOT EXISTS migration_staging (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL,
  source text NOT NULL,
  source_id text,
  target_data jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid boolean NOT NULL,
  committed_request_id uuid REFERENCES requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS migration_batch_idx ON migration_staging(batch_id, source, valid);

CREATE TABLE IF NOT EXISTS system_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS users_touch ON users;
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS requests_touch ON requests;
CREATE TRIGGER requests_touch BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
