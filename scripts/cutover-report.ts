// Read-only. Reports what the approval line and the OpsHub migration will meet in this
// database. Changes nothing; run before and after each deploy step.
import { pool, query } from "../lib/db";

const hasColumn = async (table: string, column: string) =>
  !!(await query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [table, column])).rowCount;
const hasTable = async (table: string) =>
  !!(await query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [table])).rowCount;

const migrations = (await query<{ filename: string }>(`SELECT filename FROM schema_migrations ORDER BY filename`)).rows.map(r => r.filename);
console.log("Applied migrations:", migrations.join(", ") || "(none)");

console.log("\nRequests by type/status (approval types only):");
console.table((await query(`SELECT type,status,count(*)::int n FROM requests WHERE type IN ('subscription_approval','email_account_request') GROUP BY 1,2 ORDER BY 1,2`)).rows);

if (await hasColumn("requests", "approval_required")) {
  const legacy = await query(`SELECT type,status,count(*)::int n FROM requests WHERE type IN ('subscription_approval','email_account_request') AND NOT approval_required AND resolved_at IS NULL AND closed_at IS NULL GROUP BY 1,2 ORDER BY 1,2`);
  console.log("\nOpen approval-type requests submitted BEFORE the approval line (no approval_steps; left on their old workflow, not back-filled):");
  console.table(legacy.rows);
}

if (await hasColumn("users", "manager_user_id")) {
  const u = (await query(`SELECT count(*)::int active,
      count(*) FILTER (WHERE 'ceo'=ANY(roles))::int ceo,
      count(*) FILTER (WHERE manager_user_id IS NOT NULL)::int with_manager,
      count(*) FILTER (WHERE manager_user_id IS NULL AND NOT 'ceo'=ANY(roles)
        AND NOT EXISTS (SELECT 1 FROM users r WHERE r.manager_user_id=users.id AND r.disabled_at IS NULL))::int no_approver
    FROM users WHERE disabled_at IS NULL`)).rows[0];
  console.log("\nActive users:", u);
  console.log("  no_approver = users who could not submit an approval-line request today (no manager, not a manager, not CEO).");
  const off = (await query(`SELECT email FROM users WHERE disabled_at IS NULL AND manager_user_id IS NULL AND NOT 'ceo'=ANY(roles)
      AND NOT EXISTS (SELECT 1 FROM users r WHERE r.manager_user_id=users.id AND r.disabled_at IS NULL) ORDER BY email LIMIT 50`)).rows;
  if (off.length) console.log("  first 50:", off.map(r => r.email).join(", "));
}
if (await hasTable("settings")) console.log("\nApproval line setting:", (await query(`SELECT value FROM settings WHERE key='approvals'`)).rows[0]?.value ?? "(absent)");

console.log("\nOpsHub rows by sample flag (true = fictional seed, false = real, null = NOT YET CLASSIFIED):");
const tables = ["companies", "services", "subscriptions", "purchase_requests", "contracts", "invoices", "payables", "ledger_entries", "contract_assignments"];
const rows = [];
for (const t of tables) {
  if (!(await hasTable(t))) continue;
  if (await hasColumn(t, "sample")) rows.push({ table: t, ...(await query(`SELECT count(*) FILTER (WHERE sample)::int sample, count(*) FILTER (WHERE sample = false)::int real, count(*) FILTER (WHERE sample IS NULL)::int unclassified FROM ${t}`)).rows[0] });
  else rows.push({ table: t, ...(await query(`SELECT count(*)::int total FROM ${t}`)).rows[0], note: "no sample column yet" });
}
console.table(rows);

if (await hasTable("subscriptions")) {
  const bad = (await query(`SELECT count(*)::int n FROM subscriptions WHERE card_last4 <> '' AND card_last4 !~ '^[0-9]{4}$'`)).rows[0].n;
  console.log(`\nSubscriptions with a card value that is not exactly 4 digits: ${bad}`);
}
if (await hasTable("invoices")) {
  const mismatch = await query(`SELECT c.reference, c.total_cents, sum(i.amount_cents)::bigint invoiced, count(i.*)::int n
      FROM contracts c JOIN invoices i ON i.contract_id=c.id AND i.status<>'void' GROUP BY c.id HAVING sum(i.amount_cents)<>c.total_cents`);
  console.log(`Contracts whose non-void invoices do not sum to the total: ${mismatch.rowCount}`);
  if (mismatch.rowCount) console.table(mismatch.rows);
}
await pool.end();
