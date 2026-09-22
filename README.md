# Sankari Holding Unified Systems Platform

One self-hosted internal portal for subscription approvals, IT helpdesk requests, email-account requests, board KPIs, and a read-only Jira dashboard. The application uses Next.js, PostgreSQL, Google Workspace SSO, SMTP notifications, and a background worker.

## Included

- Employee submission form with all three request types and a “my requests” view.
- Separate workflows for subscription approvals, helpdesk, and email provisioning.
- Agent/admin queue, assignments, comments, lifecycle timestamps, audit records, optimistic concurrency, and an email outbox.
- Board/admin KPI dashboard: open/closed, SLA compliance, overdue queue, resolution time, volume trend, and agent workload. It refreshes every 15 seconds.
- Dev/admin Jira dashboard with per-project and “my tasks” views. The worker refreshes Jira every 5–10 minutes.
- Admin Settings page for assigning employee, agent, admin, board, and dev roles after a user’s first Google login.
- Rate limiting, server-side validation, domain-restricted authentication, health checks, nightly PostgreSQL backups, and optional off-server rclone copies.
- Staged ClickUp migration with traceability, reconciliation reports, and refusal to commit incomplete mappings.

## EasyPanel installation

1. In EasyPanel, create a project from the private GitHub repository and select **Docker Compose**.
2. Use [compose.easypanel.yaml](compose.easypanel.yaml) as the Compose file.
3. Copy every key from [.env.example](.env.example) into the project environment and replace placeholder values. Keep secrets in EasyPanel; never commit them.
4. Generate 'POSTGRES_PASSWORD' and 'NEXTAUTH_SECRET' with long random values. The app refuses the development login bypass in production.
5. Expose the **app** service on port **3000**, attach the final domain, enable HTTPS, and force HTTP-to-HTTPS in EasyPanel.
6. Confirm that 'https://YOUR-DOMAIN/api/health' returns '{"ok":true,...}'.

EasyPanel supplies the public reverse proxy and TLS certificate. [deploy/nginx.conf](deploy/nginx.conf) is an optional nginx example for a server that does not use EasyPanel.

## Google Workspace OAuth setup

This requires a Google Workspace administrator for 'sankari-holding.com'.

1. Open Google Cloud Console and create or select a project owned by the Sankari Workspace organization.
2. Configure **Google Auth Platform / Audience** as **Internal**.
3. Create an **OAuth 2.0 Client ID**, application type **Web application**.
4. Add the authorized JavaScript origin exactly as 'https://YOUR-DOMAIN'.
5. Add the authorized redirect URI exactly as 'https://YOUR-DOMAIN/api/auth/callback/google'.
6. Put the client ID and client secret into 'GOOGLE_CLIENT_ID' and 'GOOGLE_CLIENT_SECRET' in EasyPanel.
7. Set 'NEXTAUTH_URL=https://YOUR-DOMAIN' and keep 'GOOGLE_WORKSPACE_DOMAIN=sankari-holding.com'.
8. Put the first administrator’s address in 'ADMIN_EMAILS'. After that person signs in, use **Settings → People and roles** to assign board, dev, and agent access.

The OAuth “Internal” audience and the application’s own verified-email/domain check both restrict login to the Workspace domain.

## SMTP notifications

Set 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', and 'SMTP_FROM'. For Google Workspace SMTP, create an app password or SMTP relay credential permitted by your administrator. Run the **worker** service alongside the app. It sends submitted, assigned, and resolved messages, retries failures, alerts on approaching/overdue SLAs, and sends a daily canary message to 'ALERT_EMAIL'.

The Settings page shows whether SMTP is configured and the outbox state. Test delivery after deployment by submitting one request, assigning it, and resolving it; verify all three messages in the destination mailbox.

## Jira integration

No Jira connector was available in this Codex environment, so the project uses Jira Cloud REST API v3 directly.

1. Create a dedicated read-only Jira service account and API token.
2. Set 'JIRA_BASE_URL', 'JIRA_SERVICE_EMAIL', and 'JIRA_API_TOKEN'.
3. Set 'JIRA_PROJECT_KEYS' to comma-separated project keys. Leaving it empty intentionally imports no Jira issues.
4. Set 'JIRA_ALLOWED_EMAILS' to the permitted developer emails, then assign those users the **dev** role in Settings after their first login.
5. Keep 'JIRA_POLL_MINUTES' between 5 and 10 for the requested refresh interval.

The integration is read-only and stores a local dashboard cache. Verify the worker log reports a successful sync, each configured project appears, and “My tasks” returns only issues assigned to the signed-in user.

## ClickUp migration

The connected ClickUp workspace was inventoried on 2026-09-23. Full task data was retrieved locally for **735 unique tasks**:

| Source list | Unified type | Count |
|---|---:|---:|
| طلبات الدعم الفني | Helpdesk | 532 |
| طلبات انشاء ايميلات | Email account request | 203 |

The reconciled non-sensitive inventory is in [migration/clickup-inventory.json](migration/clickup-inventory.json). Raw exports contain employee information and are excluded from Git. A PostgreSQL dry run reconciled all 735 unique records with zero duplicates, but every row is missing at least one required identity field. The exact aggregate findings are in [migration/clickup-dry-run-summary.json](migration/clickup-dry-run-summary.json). No source value was guessed and no row was committed.

To reproduce the export, set 'CLICKUP_API_TOKEN' locally and run:

~~~sh
npm run migration:export-clickup
npm run migration:dry-run
~~~

The dry-run writes all transformed rows to 'migration_staging' and a JSON report under 'migration-output/'. Review the report and source/valid/flagged counts. Rows missing requester name, email, department, company, creation time, type, or a known status remain flagged; the code does not invent values. Commit only a reviewed batch:

~~~sh
MIGRATION_BATCH_ID=<reviewed-batch-uuid> npm run migration:commit
~~~

The ClickUp source for subscription approvals was not uniquely identified. It remains unimported until the exact list is provided. Existing ClickUp/Claude trackers are read-only sources and are never changed or deleted.

## Backups and monitoring

The backup service creates a compressed PostgreSQL dump and SHA-256 checksum every 24 hours, retains local copies for 'BACKUP_RETENTION_DAYS', and copies them off-server when 'RCLONE_REMOTE' plus the 'RCLONE_CONFIG_REMOTE_*' values are supplied. The Compose example defines an S3-compatible rclone remote named 'remote'; set 'RCLONE_REMOTE=remote:your-backup-folder'. Point EasyPanel’s monitor or another uptime service at '/api/health' and send downtime alerts to the operations contact.

Perform a restore drill before cutover:

~~~sh
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /backups/sankari-TIMESTAMP.dump
~~~

## Verification status

| Phase | Programming status | Live verification required after installation |
|---|---|---|
| Foundation | App, PostgreSQL schema, Docker image, EasyPanel Compose, SSO enforcement, health endpoint | Domain, HTTPS, Google Internal login |
| Employee portal | Submission, ownership filtering, workflows, comments, SMTP outbox/worker | Real request and three delivered messages |
| Migration | 735 ClickUp tasks exported and reconciled; PostgreSQL dry run flagged all 735 for missing required fields and committed none | Correct missing source fields, rerun/review dry run, then commit; identify subscription list |
| KPI dashboard | Board/admin gate and live 15-second refresh | Assign board users and compare metrics to migrated data |
| Jira dashboard | REST v3 sync, project scope, developer role, my-tasks view | Add credentials/projects/developers and verify live issues |
| Hardening | Rate limits, validation, security headers, non-committed secrets, backups, health check | Configure off-server rclone and uptime alert; restore drill |

## Development and automated checks

Requires Node.js 24 and PostgreSQL 17.

~~~sh
npm ci
npm run db:migrate
npm run db:smoke
npm run check
npm audit --omit=dev --audit-level=high
docker build -t sankari-unified-platform:test .
~~~

GitHub Actions repeats the database migration/KPI smoke test, unit tests, type check, production build, dependency audit, and container build on every push.
