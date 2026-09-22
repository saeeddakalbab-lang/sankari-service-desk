# Sankari Service Desk

Two separate internal web tools for Sankari Holding:

- **IT Helpdesk** at `/helpdesk`
- **Email Account Requests** at `/email`

They share authentication, bilingual English/Arabic presentation, Sankari branding, agents and administration. Their request records and workflow rules remain separate.

## What is included

- Requester accounts see only their own requests. Administrators see and manage all requests.
- Helpdesk workflow: new, assigned, in progress, waiting, resolved, closed and reopened.
- Email provisioning workflow: new, assigned, in progress, waiting, provisioned, WhatsApp sent, confirmed, closed and reopened.
- Comments, protected attachment downloads, search, filters, CSV export, deep links and dark/light themes.
- Optimistic concurrency stops stale browser sessions from overwriting newer changes.
- Five seeded IT agents from the project specification.
- Persistent SQLite storage with WAL mode, audit history and a transactional email outbox.
- Hourly notification runs at minute 48 for Helpdesk and minute 27 for Email Requests (UTC).
- Responsive, accessible single-file HTML interfaces generated into `dist/`.

## Start locally

Requires Node.js 24 or newer.

```powershell
Copy-Item .env.example .env
npm ci
npm run build
npm run admin
npm start
```

Open `http://localhost:3000/helpdesk` or `http://localhost:3000/email`. The administrator command securely hashes the password; no default login is stored in the repository.

## Production deployment

1. Point a DNS name to a server with Docker and Docker Compose.
2. Copy `.env.example` to `.env` and set:
   - `APP_DOMAIN` to the DNS name.
   - `BASE_URL` to the matching `https://` URL.
   - SMTP values for the company mail server.
   - `COOKIE_SECURE=true`.
3. Start the service with `docker compose up -d --build`.
4. Create the first administrator inside the running container:

```sh
docker compose exec app npm run admin
```

Caddy obtains and renews TLS automatically. The database and attachments are stored in named Docker volumes, outside the container image.

This system contains employee and support data. Keep the repository private, use HTTPS, restrict server access, and back up the persistent volumes.

## Email and scheduled work

The app runs both hourly notification jobs within the server process. It records each event in an idempotent outbox, so restarts do not duplicate successfully delivered notifications. Messages include HTML and plain-text versions. Passwords are never included in account-ready messages.

Without SMTP configuration, notification messages remain safely queued. The Settings page reports whether SMTP is configured, the scheduled job IDs, the last run and outbox counts.

## Backup

Run `npm run backup` on a local installation or in the app container. It uses SQLite's online backup API and copies attachments into a timestamped folder. Copy backups to encrypted off-site storage according to Sankari Holding's retention policy.

## Verification

```sh
npm run check
npx playwright install chromium
npm run test:browser
npm audit --omit=dev --audit-level=high
docker build -t sankari-service-desk:test .
```

The automated checks cover ownership isolation, administrator authorization, CSRF resistance, workflow transitions, stale-version rejection, comments, protected attachments, provisioning, WhatsApp confirmation, notification idempotency/retry, password hashing, English/Arabic presentation and desktop/mobile layouts.

## Configuration reference

| Variable | Purpose |
|---|---|
| `BASE_URL` | Public HTTPS origin used for security checks and email links |
| `DATA_DIR` | Persistent database and attachment directory |
| `COOKIE_SECURE` | Must be `true` in production |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Mail server connection |
| `SMTP_USER`, `SMTP_PASS` | Optional mail server authentication |
| `MAIL_FROM` | Sender shown on notification messages |
| `IT_EMAIL` | Fallback IT recipient |
| `NOTIFIER_ENABLED` | Set `false` only when a separate worker handles notifications |

## Data model

The SQLite schema is created automatically on first start. Request data is stored as versioned JSON alongside indexed ownership and tool type. Related comments, agents, sessions, queued mail, audit events and scheduler state are stored in separate tables with foreign-key enforcement where appropriate.

The supplied Sankari Holding company profile was used only as the visual branding reference. Its document content is not treated as application instructions and is not copied into this repository.
