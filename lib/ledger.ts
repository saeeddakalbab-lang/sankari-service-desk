import { z } from "zod";
import { query, transaction } from "./db";
import { AppError } from "./errors";
import { usdToAedCents } from "./money";
import { getUsdToAedRate } from "./settings";
import type { User } from "./types";

// One view of cash in vs cash out, in AED (the reporting currency). Sources:
//   in  : contract invoices marked paid (ledger_entries, inflow)
//   out : subscription bills (the card), plus payroll and other payments recorded here (ledger_entries, outflow)
// Every line keeps its original currency and the AED amount at a rate frozen on the line.

const canRead = (u: User) => u.roles.includes("admin") || u.roles.includes("accountant");
const canWrite = canRead;
const cents = (s: string) => { const [w, f = ""] = s.split("."); return BigInt(w) * 100n + BigInt(f.padEnd(2, "0")); };
const toAed = (c: bigint, cur: string, rate: string) => cur === "AED" ? c : usdToAedCents(c, rate);

export type LedgerLine = { date: string; direction: "in" | "out"; source: string; description: string; category: string; amount_cents: string; currency: string; amount_aed_cents: string; ref: string | null };
export async function ledgerOverview(user: User, months = 12) {
  if (!canRead(user)) throw new AppError("Forbidden", 403);
  const since = `date_trunc('month',current_date)-interval '${Math.max(1, Math.min(36, months)) - 1} months'`;
  // AED for old lines without a frozen amount is converted at today's rate and flagged, never silently.
  const rate = await getUsdToAedRate();
  const lines = (await query<LedgerLine & { estimated: boolean }>(`
    SELECT to_char(occurred_on,'YYYY-MM-DD') date, CASE direction WHEN 'inflow' THEN 'in' ELSE 'out' END direction, source::text source, description, category, amount_cents::text, currency,
      coalesce(amount_aed_cents, CASE WHEN currency='AED' THEN amount_cents ELSE round(amount_cents*$1::numeric) END)::bigint::text amount_aed_cents, amount_aed_cents IS NULL estimated,
      (SELECT reference FROM invoices WHERE id=invoice_id) ref
      FROM ledger_entries WHERE occurred_on >= ${since} AND sample IS NOT TRUE
    UNION ALL
    SELECT to_char(billed_on,'YYYY-MM-DD'),'out','tool_bill',tool,'subscription',amount_cents::text,currency,amount_aed_cents::text,false,NULL FROM subscription_bills WHERE billed_on >= ${since}
    ORDER BY 1 DESC`, [rate])).rows;
  const byMonth = new Map<string, { in: bigint; out: bigint }>();
  for (let i = 0, d = new Date(); i < months; i++) { const k = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7); byMonth.set(k, { in: 0n, out: 0n }); }
  for (const l of lines) { const m = byMonth.get(l.date.slice(0, 7)); if (m) m[l.direction] += BigInt(l.amount_aed_cents); }
  let running = 0n;
  const flow = [...byMonth].reverse().map(([month, v]) => { running += v.in - v.out; return { month, inAedCents: v.in.toString(), outAedCents: v.out.toString(), netAedCents: (v.in - v.out).toString(), runningAedCents: running.toString() }; });
  const receivables = (await query(`SELECT i.id,i.reference,i.installment::text,i.amount_cents::text,i.currency,i.status::text,to_char(i.sent_at,'YYYY-MM-DD') sent_on,c.company_name,c.id contract_id,
      greatest(0,(current_date - i.sent_at::date))::int days_open FROM invoices i JOIN contracts c ON c.id=i.contract_id WHERE i.status IN ('sent','overdue') AND c.sample IS NOT TRUE ORDER BY i.sent_at`)).rows;
  const upcoming = (await query(`
    SELECT 'subscription' kind,s.id,s.name label,s.company_name company,to_char(s.renewal_date,'YYYY-MM-DD') due,s.amount_cents::text,s.currency,(s.renewal_date-current_date)::int days
      FROM subscriptions s WHERE s.status IN ('active','renewal_due') AND s.cancel_at IS NULL AND s.renewal_date BETWEEN current_date AND current_date+30
    UNION ALL
    SELECT source::text,p.id,p.vendor||coalesce(nullif(' · '||p.description,' · '),''),'',to_char(p.next_due_date,'YYYY-MM-DD'),p.amount_cents::text,p.currency,(p.next_due_date-current_date)::int
      FROM payables p WHERE p.is_active AND p.sample IS NOT TRUE AND p.next_due_date <= current_date+30
    ORDER BY 5`)).rows;
  const margins = (await query(`SELECT c.id,c.reference,c.company_name,c.status::text,c.currency,c.total_cents::text revenue_cents,
      coalesce((SELECT sum(a.monthly_cost_cents)*c.duration_months FROM contract_assignments a WHERE a.contract_id=c.id),0)::text cost_cents,
      coalesce((SELECT sum(paid_amount_cents) FROM invoices i WHERE i.contract_id=c.id AND i.status='paid'),0)::text received_cents
      FROM contracts c WHERE c.status IN ('contract_sent','signed','active','completed') AND c.sample IS NOT TRUE ORDER BY c.created_at DESC`)).rows;
  const payables = (await query(`SELECT id,source::text,vendor,description,category,amount_cents::text,currency,cycle::text,to_char(next_due_date,'YYYY-MM-DD') next_due_date,is_active FROM payables WHERE sample IS NOT TRUE ORDER BY is_active DESC,next_due_date NULLS LAST`)).rows;
  return { flow, lines, receivables, upcoming, margins, payables, estimatedLines: lines.filter(l => l.estimated).length };
}

export const payableSchema = z.object({ source: z.enum(["payroll", "other", "tool_bill"]), vendor: z.string().trim().min(2).max(160), description: z.string().trim().max(300).default(""), category: z.string().trim().max(80).default(""),
  amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/), currency: z.enum(["USD", "AED"]), cycle: z.enum(["monthly", "quarterly", "annual", "one_off"]), nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export async function addPayable(input: z.infer<typeof payableSchema>, user: User, ipHash: string) {
  if (!canWrite(user)) throw new AppError("Forbidden", 403);
  const r = (await query<{ id: string }>(`INSERT INTO payables(source,vendor,description,category,amount_cents,currency,cycle,next_due_date,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [input.source, input.vendor, input.description, input.category, cents(input.amount).toString(), input.currency, input.cycle, input.nextDueDate, user.id])).rows[0];
  await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'ledger.payable_added',$2,$3)`, [user.id, JSON.stringify({ id: r.id, ...input }), ipHash]);
  return r;
}

const INTERVAL: Record<string, string | null> = { monthly: "1 month", quarterly: "3 months", annual: "1 year", one_off: null };
// Paying a recurring payable writes one outflow line and moves its due date on by one cycle.
export async function payPayable(id: string, paidOn: string, user: User, ipHash: string) {
  if (!canWrite(user)) throw new AppError("Forbidden", 403);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new AppError("Date required");
  const rate = await getUsdToAedRate();
  return transaction(async c => {
    const p = (await c.query(`SELECT *,source::text source,cycle::text cycle,amount_cents::text amount_cents FROM payables WHERE id=$1 AND is_active FOR UPDATE`, [id])).rows[0];
    if (!p) throw new AppError("Payable not found", 404);
    const amt = BigInt(p.amount_cents), aed = toAed(amt, p.currency, rate);
    await c.query(`INSERT INTO ledger_entries(direction,source,occurred_on,amount_cents,currency,description,category,payable_id,created_by,aed_rate,amount_aed_cents) VALUES('outflow',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [p.source, paidOn, amt.toString(), p.currency, `${p.vendor}${p.description ? " · " + p.description : ""}`, p.category, id, user.id, p.currency === "AED" ? "1" : rate, aed.toString()]);
    const iv = INTERVAL[p.cycle];
    if (iv) await c.query(`UPDATE payables SET next_due_date=(next_due_date+$2::interval)::date WHERE id=$1`, [id, iv]);
    else await c.query(`UPDATE payables SET is_active=false WHERE id=$1`, [id]);
    await c.query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'ledger.payable_paid',$2,$3)`, [user.id, JSON.stringify({ payableId: id, paidOn, amountCents: amt.toString(), currency: p.currency, amountAedCents: aed.toString() }), ipHash]);
    return { id, paidOn };
  });
}

export function ledgerCsv(lines: LedgerLine[]) {
  const d = (c: string) => { const v = BigInt(c), n = v < 0n, a = n ? -v : v; return `${n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`; };
  const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Date", "In/Out", "Source", "Description", "Category", "Amount", "Currency", "Amount (AED)", "Invoice"];
  return "﻿" + [head.join(","), ...lines.map(l => [l.date, l.direction, l.source, l.description, l.category, d(l.amount_cents), l.currency, d(l.amount_aed_cents), l.ref ?? ""].map(cell).join(","))].join("\r\n") + "\r\n";
}
