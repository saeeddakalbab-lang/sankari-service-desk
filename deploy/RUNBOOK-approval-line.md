# Runbook: deploy migrations 003 and 004 to production

Target: https://it-portal.sankari-holding.com (EasyPanel, Docker Compose). Treat it as live data.

**Read first:** the app container runs `scripts/migrate-db.ts` from `scripts/entrypoint.sh` on
every start, so **deploying an image applies its pending migrations right away**. Take the dump
before you deploy, never after.

**Email needs a second service.** The web app only queues email in `email_outbox`; a separate
worker service sends it (and runs reminders, SLA alerts and the monthly statement). In EasyPanel it
is its own service built from the same repo and branch, with the same environment as the app
(`DATABASE_URL`, `NEXTAUTH_URL`, all `SMTP_*`) and the command
`node_modules/.bin/tsx scripts/worker.ts`. If emails sit in `pending` with `attempts = 0`, the
worker is not running.

Two changes, deployed separately:

| Step | Migration | What it does | Risk |
|---|---|---|---|
| A | `003_request_import_unique_fix.sql` | Replaces `request_import_unique` (NULLS NOT DISTINCT) with a partial unique index | Fixes a possible live outage; does nothing on a correctly built DB |
| B | `004_approval_line.sql` | Approval line, CEO role, `manager_user_id`, card-number guard, `sample` flag, `installment_split()` | Additive; the approval line stays **off** until an admin turns it on |

Both are additive. Rollback scripts are in `db/rollback/`. The 004 rollback refuses to run once
approval data exists.

---

## 0. Before anything: is production affected by the 003 bug?

Run read-only in the production database console:

```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'requests'::regclass AND conname = 'request_import_unique';
SELECT count(*) FROM requests WHERE import_source IS NULL AND import_id IS NULL;
```

If the first query returns `UNIQUE NULLS NOT DISTINCT (import_source, import_id)`, production can
hold only **one** portal-submitted request, and every later submission fails with "Request could
not be completed". Step A fixes that.

## Shell setup (paste once per console session)

The app image is Alpine: it has `psql`, `pg_dump`, `pg_restore` and `node`, but **no `curl`**, and
no local Postgres server (so `createdb` with no address fails). Paste this first, in the app
container's console, with the step number you are on:

```sh
export STEP=011                     # the migration number of this step
export REH_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/sankari_rehearsal";console.log(u.href)')
check() { node -e 'fetch(process.argv[1],{method:process.argv[2]||"GET",redirect:"manual"}).then(async r=>console.log(r.status,r.headers.get("location")||"",(await r.text()).slice(0,100))).catch(e=>{console.log("DOWN",e.message);process.exit(1)})' "$@"; }
```

`REH_URL` is the production server with the database name swapped to `sankari_rehearsal`; it never
points at the live database. `check URL` prints the HTTP status (use `check URL POST` for a POST).

## 1. Dump (before every step)

```sh
TS=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file=/backups/sankari-pre-$STEP-$TS.dump
sha256sum /backups/sankari-pre-$STEP-$TS.dump > /backups/sankari-pre-$STEP-$TS.dump.sha256
pg_restore --list /backups/sankari-pre-$STEP-$TS.dump | grep -c "TABLE DATA"   # must be > 0
```

Write down the file name (`ls -l /backups`). Then copy it off the server
(`rclone copy /backups "$RCLONE_REMOTE"`), or download it from EasyPanel: unless `/backups` is a
mounted volume, **the next deploy deletes it** with the old container.

## 2. Rehearse on a restored copy (before every step)

A separate database, `sankari_rehearsal`, on the same Postgres server. The live database is not
touched: every command below uses `$REH_URL`.

```sh
DUMP=$(ls -t /backups/sankari-pre-*.dump | head -1); echo "$DUMP"   # the dump from section 1
psql "$DATABASE_URL" -c 'DROP DATABASE IF EXISTS sankari_rehearsal' -c 'CREATE DATABASE sankari_rehearsal'
pg_restore --no-owner --exit-on-error --dbname="$REH_URL" "$DUMP"
DATABASE_URL="$REH_URL" npm run db:report       # before
DATABASE_URL="$REH_URL" npm run db:migrate
DATABASE_URL="$REH_URL" npm run db:guards       # rolls itself back
DATABASE_URL="$REH_URL" npm run db:report       # after: compare counts
```

The `DROP DATABASE` line only ever names `sankari_rehearsal`, the throwaway copy. If `CREATE DATABASE`
says permission denied, the app's database user can't create databases: run the same two lines in
EasyPanel's Postgres service console as the `postgres` user.

**`db:migrate` only applies the migrations inside the image you run it from.** The running image is
the old one, so for a new step it applies nothing. To rehearse new migrations (011–013), see
"Rehearsing 011–013 with a staging app" below.

Stop if the migration fails or any count changes that you didn't expect. Send me the output: if a
constraint conflicts with existing rows, the offending rows get reported, not coerced.
For step B, also test the rollback on the rehearsal copy:
`psql "$REH_URL" -v ON_ERROR_STOP=1 -f db/rollback/004_approval_line.down.sql`, then run `db:migrate` again.

## 3. Deploy step A (003 only)

Build an image from the commit that contains 003 but **not** 004 (or temporarily move
`004_approval_line.sql` out of `db/migrations/` for this build). Deploy it in EasyPanel, then:

```sh
check https://it-portal.sankari-holding.com/api/health     # 200 {"ok":true,...}
```

Submit two helpdesk tickets from the portal. Both must save. Check the app logs for
`Applied 003_request_import_unique_fix.sql`.

## 4. Deploy step B (004)

Repeat sections 1 and 2 with `STEP=004`. Deploy the full image, then:

```sh
check https://it-portal.sankari-holding.com/api/health
check https://it-portal.sankari-holding.com/api/approvals   # 401
check https://it-portal.sankari-holding.com/api/requests    # 401
```

The approval line is **off** after deploy (`settings.approvals = {"enabled":false}`), so behaviour
is unchanged until step 5.

## 5. Turn the approval line on

1. In **Admin settings → People and approvals**: choose the CEO, set every
   employee's **Manager**, and set the CEO's own manager. Without that the CEO cannot submit.
2. Run `npm run db:report` against production (read-only). `no_approver` must be 0, or you must
   accept that those people are refused when they submit a subscription request.
   Nobody is silently skipped.
3. Turn it on in **Admin settings → Approval line** (or `PUT /api/admin/approvals {"enabled":true}`; audited). This is refused
   if no active CEO exists.
4. Smoke test with real accounts: an employee submits a **subscription** request (with the step C code, email
   and helpdesk requests skip approval). The manager sees
   it under `GET /api/approvals`; the requester's own approve call returns **403**; the manager
   approves, then the CEO approves; the status becomes `approved`; three emails are queued
   (see Settings → Mail operations).

To turn it off again: `PUT /api/admin/approvals {"enabled":false}`. Requests already in approval
keep their frozen chain and still need their approvers.

## What 004 deliberately does not touch

- **Requests submitted before the approval line** keep `approval_required = false` and their old
  workflow. No approvers are invented for them after the fact. `db:report` lists the open ones.
- **OpsHub `sample` flag** starts as NULL ("not yet classified") on every existing row. The
  importer must set `true`/`false` explicitly. `db:report` prints sample / real / unclassified
  counts per table; review them before cutover.
- **Card data:** `card_last4` has non-digits stripped on write and must then be exactly 4 digits.
  The error never echoes the value. PostgreSQL logs the full text of a *failing statement*, so a
  PAN typed as a literal in `psql` would still land in the server log. The app always sends bound
  parameters, which are not logged by default. Don't paste card numbers into ad-hoc SQL.

---

# Step C: migration 005 and the rebuilt interface

Deploy only after steps A and B are live and checked. Same routine: dump (section 1),
rehearse on a restored copy (section 2) with `STEP=005`, then deploy.

| Migration | What it does |
|---|---|
| `005_roles_preferences.sql` | Adds the `owner` role (one active holder at most, same rule as the CEO), `users.preferred_theme` / `users.preferred_locale` (NULL until someone chooses), and the `branding`, `appearance` and `email_domains` settings. Rollback: `db/rollback/005_roles_preferences.down.sql`, which refuses to run once an Owner is set or anyone has saved a preference. |

## Behaviour that changes on deploy

- **Email account requests no longer use the approval line.** New ones go straight to the IT
  queue. Email requests already waiting for approval keep their frozen approvers and still need them.
  Only subscriptions go Manager → CEO.
- **Email addresses are limited to the admin's domain list.** The list starts with
  `sankari-holding.com`. Add the other Workspace domains in **Admin settings → Email domains**
  before announcing the change, otherwise people on other domains can't submit.
- **Subscriptions gain `assigned` and `in progress`** as fulfilment statuses after approval.
- **The home screen depends on the role.** CEO → Approvals; Board or Owner → IT KPIs; agent or
  admin → Team queue; everyone else → Dashboard.

## Build note

The fonts (Zilla Slab, Jost, IBM Plex Mono, IBM Plex Sans Arabic) are downloaded by `next/font` at
**build time** and served from the app itself, because the CSP only allows fonts from this site.
The Docker build stage therefore needs outbound HTTPS to `fonts.googleapis.com` and `fonts.gstatic.com`.
Running the app needs no outbound access for fonts.

## Checks after deploy

```sh
check https://it-portal.sankari-holding.com/api/health
check https://it-portal.sankari-holding.com/api/oversight/stuck   # 401
check https://it-portal.sankari-holding.com/api/me/preferences    # 401
```

Then sign in as an admin: set the Owner and Board in **Admin settings → People and approvals**, add
the email domains, and confirm the sign-in page, one Arabic page and one dark-mode page look right.

# Steps D–F: Rules, the 48-hour skip, People (migrations 006, 007, 008)

Deploy one migration per release, in order, only after the previous step is live and checked.
Each one uses the same routine: dump (section 1) with `STEP=006` / `007` / `008`, rehearse on a
restored copy (section 2) including the rollback file, then deploy and run the checks below. The
entrypoint runs `db:migrate` on container start, so the dump must be taken **before** the deploy.

| Step | Migration | What it does | Rollback |
|---|---|---|---|
| D | `006_rules.sql` | Inserts the `rules` setting (SLA hours per priority, skip threshold 48h, renewal reminder 14 days, which types need approval, notification switches). Existing tickets keep their SLA target; new values apply to new requests only. | `db/rollback/006_rules.down.sql` — refuses once an admin has saved Rules. |
| E | `007_approval_skip.sql` | Allows step status `skipped`, adds `skipped_by_user_id` and `skip_reason`, and replaces the step guard so a skip is accepted only when the step is current and overdue, by an Owner/CEO/Board user who is neither the requester nor the approver, with a reason. The derived request status counts a skipped step as passed. No existing row changes. | `db/rollback/007_approval_skip.down.sql` — refuses while any step is `skipped`; restores the 004 functions. |
| F | `008_people.sql` | Adds the `manager` role and `users.invited_by_user_id` / `users.invited_at`, so an admin can add a person by email before their first sign-in. | `db/rollback/008_people.down.sql` — refuses while anyone has the manager role or was added by an admin. |

Rehearsal check for E, on the restored copy: `npm run db:guards` must end with "All database
guards held" (it includes the skip section and rolls itself back).

Checks after each deploy:

```sh
check https://it-portal.sankari-holding.com/api/health
check https://it-portal.sankari-holding.com/api/admin/rules     # 401 (D)
check https://it-portal.sankari-holding.com/api/requests/00000000-0000-4000-8000-000000000000/skip POST   # 401 (E)
check https://it-portal.sankari-holding.com/api/admin/people    # 401 (F)
```

Then, signed in as an admin: open **Admin settings → Rules** and check the values match the table
above (D); open **Oversight** as the CEO or a Board member and confirm no Skip button shows on a
step younger than 48 hours (E); add one real colleague under **Add a person**, ask them to sign in,
and confirm they land on the right home screen (F). The Google sign-in still passes `hd` for the
primary domain, so people on the other Workspace domains can be added but cannot sign in until
that parameter is widened.

# Step G: new-ticket alerts and email Start / Reject (migration 009)

Same routine: dump with `STEP=009`, rehearse on a restored copy including
`db/rollback/009_ticket_actions.down.sql`, run `npm run db:guards` on the copy (it now has an
"Email action links" section), then deploy.

| Migration | What it does | Rollback |
|---|---|---|
| `009_ticket_actions.sql` | Adds `action_tokens`: one row per emailed Start or Reject button, holding only an HMAC of the token (keyed with `NEXTAUTH_SECRET`), the recipient, a 72-hour expiry and who used it. A trigger makes a used or expired link unusable and the row otherwise immutable. No existing table changes. | `db/rollback/009_ticket_actions.down.sql`: refuses once any link has been used. |

Before deploying, confirm `NEXTAUTH_SECRET` and `NEXTAUTH_URL=https://it-portal.sankari-holding.com` are set
in EasyPanel. The links are built from `NEXTAUTH_URL`, and rotating the secret makes every
outstanding link invalid, which is safe: they just say "not valid".

Checks after deploy:

```sh
check https://it-portal.sankari-holding.com/api/health
check https://it-portal.sankari-holding.com/api/notifications/tickets   # 401
check https://it-portal.sankari-holding.com/api/actions/x POST         # 401
check https://it-portal.sankari-holding.com/actions/x      # 307 to /login
```

Then submit one test helpdesk ticket as an employee. Check that an agent with the queue open sees a toast
within about 20 seconds, that the email arrives with the full ticket and two buttons, that Start
opens a confirm page and only changes the ticket after **Start ticket** is pressed, and that
pressing the same email button again says "already used".

# Step H: subscription renewals and bill history (migration 010)

Same routine: dump with `STEP=010`, rehearse on a restored copy including
`db/rollback/010_renewals_bills.down.sql`, run `npm run db:guards` on the copy ("Renewals and
bills" section), then deploy. Before rehearsing, send me this read-only count from production:

```sql
SELECT count(*) AS subscriptions, count(*) FILTER (WHERE auto_renew) AS marked_auto_renew,
       count(*) FILTER (WHERE renewal_date IS NOT NULL) AS with_renewal_date
FROM subscriptions;
```

| Migration | What it does | Rollback |
|---|---|---|
| `010_renewals_bills.sql` | Adds owner, source request, company name, cancel date and flagged time to `subscriptions` (all nullable or defaulted), plus `subscription_renewals` (reminder, the owner's final decision, the flag if unanswered) and append-only `subscription_bills` (minor units, AED rate frozen per row, card last 4 only). A trigger refuses a renewal bill without the owner's recorded "renew". No existing row changes; `auto_renew` is no longer read. | `db/rollback/010_renewals_bills.down.sql`: refuses once any bill or renewal exists or any subscription uses the new columns. |

Deploy the worker together with the web app, then run one pass by hand: `npx tsx scripts/worker.ts --once`.
Existing subscriptions have no owner, so the worker skips them until an admin assigns one.

```sh
check https://it-portal.sankari-holding.com/api/health
check https://it-portal.sankari-holding.com/api/subscriptions   # 401
check https://it-portal.sankari-holding.com/api/bills/csv       # 401
```

# Rehearsing 011–013 with a staging app

The live container holds the old code, which has no 011–013, so rehearse them with a second,
temporary EasyPanel app that runs the new code against the `sankari_rehearsal` copy:

1. Take the dump (section 1) with `STEP=011`, restore it into `sankari_rehearsal` (section 2, up to
   the first `db:report`), and keep the report output.
2. In EasyPanel, create an app `it-portal-staging` from the GitHub repo, branch
   `unified-platform-rebuild`, same Dockerfile. Copy the live app's environment, then change:
   - `DATABASE_URL`: the `$REH_URL` value (run `echo "$REH_URL"` in the live console).
   - `SMTP_HOST`: empty. Also **do not create a worker** for staging. The copy holds real queued
     emails and real addresses, and nothing must reach anyone from it.
   - No domain is needed.
3. Deploy it. On start it applies 011, 012 and 013 **to the copy only**; its log shows
   `Applied 011_…`, `Applied 012_…`, `Applied 013_…`.
4. In the **staging** console: `npm run db:guards`, then `npm run db:report`. Compare with step 1.
   Also `npx tsx scripts/import-statement-subscriptions.ts` (dry run, changes nothing) and send me
   the output.
5. Rollback test, in the staging console, newest first:
   ```sh
   for m in 013_contracts_ledger 012_statements_beneficiary 011_subscription_aed_rate; do
     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rollback/$m.down.sql || break; done
   npm run db:migrate    # applies all three again
   ```
6. Delete the staging app. Then deploy for real: **merge the branch into `main`** (EasyPanel
   rebuilds the live app from it). Because the live app applies all three on start, take a fresh
   dump right before the merge. After it is live:
   ```sh
   check https://it-portal.sankari-holding.com/api/health            # 200
   check https://it-portal.sankari-holding.com/api/statements         # 401
   check https://it-portal.sankari-holding.com/contract-request       # 200
   ```
   Then do the "After" parts of steps I, J and K below, in order.

# Step I: frozen AED rate, and importing the card-statement subscriptions (migration 011)

Same routine: dump with `STEP=011`, rehearse on a restored copy including
`db/rollback/011_subscription_aed_rate.down.sql`, then deploy.

| Migration | What it does | Rollback |
|---|---|---|
| `011_subscription_aed_rate.sql` | Adds nullable `subscriptions.aed_rate` (must be > 0). A subscription billed in EUR, CHF, GBP or TRY renews at this frozen rate; without one, renewal is refused rather than guessed. No row changes. | `db/rollback/011_subscription_aed_rate.down.sql`: refuses once any subscription has a rate. |

After 011 is live, import the recurring subscriptions from the closed Mashreq card (*9425) and the
10 Hostinger plans:

1. Check **Admin settings → People** has exactly one active **Owner**. The script refuses otherwise.
2. Dry run in the app container. Read the list; it changes nothing:
   `npx tsx scripts/import-statement-subscriptions.ts`
3. Commit: `npx tsx scripts/import-statement-subscriptions.ts commit`. It is one transaction and
   idempotent, so a second run adds nothing. It writes no bills and touches no existing row.
4. **Subscriptions** now lists them on card `•••• 4164`, all owned by the Owner. The worker sends the
   Owner a reminder 14 days before each date, and only the Owner's **Renew** writes a bill.

# Step J: beneficiary and the monthly statement to accounting (migration 012)

Same routine: dump with `STEP=012`, rehearse on a restored copy including
`db/rollback/012_statements_beneficiary.down.sql`, run `npm run db:guards` on the copy ("Monthly
statement" section), then deploy the web app **and** the worker.

| Migration | What it does | Rollback |
|---|---|---|
| `012_statements_beneficiary.sql` | Copies the beneficiary onto each new bill. Adds `statement_credits` (card payments and refunds, append-only) and `monthly_statements` (the opening, charges, credits and closing must balance). Gives `email_outbox` a `held` state and attachments. Adds the `accounting` setting (empty address, opening balance 0 from 2026-09). No existing row changes. | `db/rollback/012_statements_beneficiary.down.sql`: refuses once any statement, credit, held/attached email or bill beneficiary exists. |

After deploy, as an admin, open **Accounting statement**:
1. Enter the accounting email address.
2. Enter the opening balance in AED, and the month it applies from (the carried-forward balance from
   accounting's books).
3. Record the card payments and refunds for the month.

On the 1st of each month at 06:00 Istanbul time, the worker prepares last month's statement, with
the Excel attached, as a **held** email. It never sends on its own: an admin opens the page, checks it,
and presses **Send to accounting**. Use **Print / save as PDF (Arabic)** for the PDF copy.

# Step K: contracts, invoices and the ledger (migration 013)

Same routine: dump with `STEP=013`, rehearse including `db/rollback/013_contracts_ledger.down.sql`,
run `npm run db:guards` on the copy ("Contracts, invoices, ledger" section), then deploy.

| Migration | What it does | Rollback |
|---|---|---|
| `013_contracts_ledger.sql` | Adds guards. A contract moves only along submitted → review → approved → sent → signed → active → completed; reject and cancel need a reason; signing needs the client's confirmation; price and parties are fixed once approved. A paid invoice stays paid, and an invoice amount is fixed once sent. Ledger lines become append-only and gain an AED amount at a rate frozen on the line. No existing row changes. | `db/rollback/013_contracts_ledger.down.sql`: refuses once any ledger line carries an AED amount. |

Before deploying, send me `SELECT status, count(*) FROM contracts GROUP BY 1;` and
`SELECT count(*) FROM ledger_entries;` from production. They are reads only. They show whether
OpsHub data already sits in these tables, since the new guards apply to any later edit of those rows.

The public form is at `https://it-portal.sankari-holding.com/contract-request`. It needs no sign-in;
it is rate-limited and has a hidden field that catches bots.
