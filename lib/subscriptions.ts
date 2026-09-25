import type { PoolClient } from "pg";
import { z } from "zod";
import { query, transaction } from "./db";
import { AppError, forbidden } from "./errors";
import { button, emailShell, para } from "./email-layout";
import { refFor } from "./format";
import { usdToAedCents } from "./money";
import { getRules } from "./rules";
import { getUsdToAedRate } from "./settings";
import type { User } from "./types";

// Subscriptions carry their cost, cycle and renewal date. A renewal only happens when the owner says
// "renew"; the worker reminds, flags a missed date and cancels a declined one at term end. Nothing
// here ever renews on its own, and the database refuses a renewal bill without the owner's decision.

const base = () => process.env.NEXTAUTH_URL || "http://localhost:3000";
const isAdmin = (u: User) => u.roles.includes("admin");
export const canSeeBills = (u: User) => u.roles.includes("admin") || u.roles.includes("accountant");
const CYCLE_INTERVAL: Record<string, string | null> = { monthly: "1 month", quarterly: "3 months", annual: "1 year", one_off: null };

async function notice(eventKey: string, recipient: string, title: string, body: string, path: string) {
  const url = new URL(path, base()).href;
  const html = emailShell(title, `${body.split("\n").map(para).join("")}<p style="margin:18px 0 0">${button(url, "Open subscriptions")}</p>`);
  await query(`INSERT INTO email_outbox(event_key,recipient,subject,html,text_body) VALUES($1,lower($2),$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`,
    [eventKey, recipient, `[Sankari] ${title}`, html, `Sankari Holding\n${title}\n\n${body}\n\nOpen subscriptions: ${url}`]);
}
const money = (cents: string | bigint, cur: string) => { const c = BigInt(cents); return `${cur} ${(c / 100n).toString()}.${(c % 100n).toString().padStart(2, "0")}`; };

export type SubscriptionRow = {
  id: string; name: string; provider: string; company_name: string; amount_cents: string; currency: string; billing_frequency: string; renewal_date: string | null;
  card_last4: string; beneficiary: string; status: string; cancel_at: string | null; renewal_flagged_at: string | null; owner_user_id: string | null; owner_name: string | null; request_id: string | null;
  request_ref: string | null; open_renewal_id: string | null; open_renewal_date: string | null; open_flagged: boolean; bills: number;
};
const subSelect = `SELECT s.id,s.name,s.provider,s.company_name,s.amount_cents::text,s.currency,s.billing_frequency::text,to_char(s.renewal_date,'YYYY-MM-DD') renewal_date,s.card_last4,s.beneficiary,s.status::text,
  to_char(s.cancel_at,'YYYY-MM-DD') cancel_at,s.renewal_flagged_at,s.owner_user_id,o.name owner_name,s.request_id,rq.type rq_type,rq.created_at rq_created,
  rn.id open_renewal_id,to_char(rn.renewal_date,'YYYY-MM-DD') open_renewal_date,(rn.flagged_at IS NOT NULL) open_flagged,(SELECT count(*)::int FROM subscription_bills b WHERE b.subscription_id=s.id) bills
  FROM subscriptions s LEFT JOIN users o ON o.id=s.owner_user_id LEFT JOIN requests rq ON rq.id=s.request_id
  LEFT JOIN LATERAL (SELECT * FROM subscription_renewals r WHERE r.subscription_id=s.id AND r.decision IS NULL ORDER BY r.renewal_date LIMIT 1) rn ON true`;
const shape = (r: SubscriptionRow & { rq_type?: string; rq_created?: string }) => ({ ...r, request_ref: r.request_id && r.rq_type ? refFor(r.rq_type, r.request_id, String(r.rq_created)) : null, rq_type: undefined, rq_created: undefined });

export async function listSubscriptions(user: User) {
  const r = await query<SubscriptionRow>(`${subSelect} ${isAdmin(user) ? "" : "WHERE s.owner_user_id=$1"} ORDER BY s.renewal_date NULLS LAST, s.name LIMIT 500`, isAdmin(user) ? [] : [user.id]);
  return r.rows.map(shape);
}
export async function ownsSubscriptions(userId: string) { return !!(await query(`SELECT 1 FROM subscriptions WHERE owner_user_id=$1 LIMIT 1`, [userId])).rowCount; }

// Approved subscription requests that do not have a subscription record yet.
export async function billableRequests() {
  const r = await query<{ id: string; type: string; created_at: string; subject: string; company: string; requester_user_id: string; requester_name: string; details: Record<string, unknown> }>(
    `SELECT r.id,r.type,r.created_at,r.subject,r.company,r.requester_user_id,r.requester_name,r.details FROM requests r WHERE r.type='subscription_approval'
       AND r.status NOT IN ('awaiting_approval','rejected','cancelled') AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.request_id=r.id) ORDER BY r.created_at DESC LIMIT 200`);
  return r.rows.map(x => ({ id: x.id, ref: refFor(x.type, x.id, String(x.created_at)), subject: x.subject, company: x.company, requesterUserId: x.requester_user_id, requester: x.requester_name,
    service: String(x.details?.service ?? x.subject), amountCents: String(x.details?.amountCents ?? "0"), currency: String(x.details?.currency ?? "AED") }));
}

const rateFor = async (c: PoolClient, requestId: string | null) => {
  if (requestId) { const d = (await c.query<{ rate: string | null }>(`SELECT details->>'usdToAedRate' rate FROM requests WHERE id=$1`, [requestId])).rows[0]; if (d?.rate && /^\d+(\.\d{1,6})?$/.test(d.rate)) return d.rate; }
  return getUsdToAedRate();
};
const aed = (cents: bigint, currency: string, rate: string) => currency === "AED" ? cents : usdToAedCents(cents, rate);

export const createSchema = z.object({
  requestId: z.string().uuid(), cycle: z.enum(["monthly", "quarterly", "annual", "one_off"]),
  renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), ownerUserId: z.string().uuid(),
  cardLast4: z.string().trim().regex(/^(\d{4})?$/, "Card: enter the last 4 digits only").default(""), provider: z.string().trim().max(120).default(""),
  beneficiary: z.string().trim().max(160).default(""),
});

// Admin records the subscription an approved request paid for, and its first bill.
export async function createFromRequest(input: z.infer<typeof createSchema>, user: User, ipHash: string) {
  if (!isAdmin(user)) throw forbidden();
  if (input.cycle !== "one_off" && !input.renewalDate) throw new AppError("A renewal date is required for a recurring subscription");
  return transaction(async c => {
    const rq = (await c.query<{ id: string; type: string; status: string; subject: string; company: string; department: string; requester_name: string; details: Record<string, unknown> }>(`SELECT id,type,status,subject,company,department,requester_name,details FROM requests WHERE id=$1 FOR UPDATE`, [input.requestId])).rows[0];
    if (!rq || rq.type !== "subscription_approval") throw new AppError("Subscription request not found", 404);
    if (["awaiting_approval", "rejected", "cancelled"].includes(rq.status)) throw new AppError("That request has not been approved", 409);
    if ((await c.query(`SELECT 1 FROM subscriptions WHERE request_id=$1`, [rq.id])).rowCount) throw new AppError("That request already has a subscription", 409);
    if (!(await c.query(`SELECT 1 FROM users WHERE id=$1 AND disabled_at IS NULL`, [input.ownerUserId])).rowCount) throw new AppError("Owner not found", 404);
    const currency = String(rq.details?.currency ?? "AED"), cents = BigInt(String(rq.details?.amountCents ?? "0")), name = String(rq.details?.service ?? rq.subject);
    if (!["USD", "AED"].includes(currency)) throw new AppError("Only USD and AED subscriptions are supported");
    // The beneficiary is who the seat is for; by default the person who asked for it.
    const rate = await rateFor(c, rq.id), beneficiary = input.beneficiary || rq.requester_name;
    const s = (await c.query<{ id: string }>(`INSERT INTO subscriptions(name,provider,company_name,department,beneficiary,amount_cents,currency,billing_frequency,renewal_date,start_date,card_last4,owner_user_id,request_id,status,method)
      VALUES($1,$2,$3,$11,$12,$4,$5,$6,$7,current_date,$8,$9,$10,'active',CASE WHEN $8<>'' THEN 'corporate_card'::payment_method END) RETURNING id`,
      [name, input.provider, rq.company, cents.toString(), currency, input.cycle, input.cycle === "one_off" ? null : input.renewalDate, input.cardLast4, input.ownerUserId, rq.id, rq.department, beneficiary])).rows[0];
    const approver = (await c.query<{ id: string }>(`SELECT approver_user_id id FROM approval_steps WHERE request_id=$1 AND status='approved' ORDER BY step_no DESC LIMIT 1`, [rq.id])).rows[0];
    const bill = (await c.query(`INSERT INTO subscription_bills(subscription_id,kind,request_id,period_start,period_end,tool,company_name,amount_cents,currency,usd_to_aed_rate,amount_aed_cents,card_last4,approved_by_user_id,created_by_user_id,beneficiary)
      VALUES($1,'initial',$2,current_date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [s.id, rq.id, input.cycle === "one_off" ? null : input.renewalDate, name, rq.company, cents.toString(), currency, rate, aed(cents, currency, rate).toString(), input.cardLast4, approver?.id ?? null, user.id, beneficiary])).rows[0];
    await c.query(`INSERT INTO audit_log(actor_id,request_id,action,after_data,ip_hash) VALUES($1,$2,'subscription.created',$3,$4),($1,$2,'bill.written',$5,$4)`,
      [user.id, rq.id, JSON.stringify({ subscriptionId: s.id, ...input }), ipHash, JSON.stringify(bill)]);
    return { id: s.id, billId: bill.id };
  });
}

// The owner's answer to a renewal. Renew writes the bill and moves the date on; decline cancels at term end.
export async function decideRenewal(subscriptionId: string, decision: "renew" | "decline", note: string, user: User, ipHash: string) {
  const result = await transaction(async c => {
    const s = (await c.query<{ id: string; name: string; owner_user_id: string | null; amount_cents: string; currency: string; billing_frequency: string; card_last4: string; request_id: string | null; company_name: string; status: string; aed_rate: string | null; beneficiary: string }>(
      `SELECT id,name,owner_user_id,amount_cents::text,currency,billing_frequency::text,card_last4,request_id,company_name,status::text,aed_rate::text,beneficiary FROM subscriptions WHERE id=$1 FOR UPDATE`, [subscriptionId])).rows[0];
    if (!s) throw new AppError("Subscription not found", 404);
    if (s.owner_user_id !== user.id) throw new AppError("Only the subscription's owner can decide its renewal", 403);
    const rn = (await c.query<{ id: string; renewal_date: string; owner_user_id: string | null }>(`SELECT id,to_char(renewal_date,'YYYY-MM-DD') renewal_date,owner_user_id FROM subscription_renewals WHERE subscription_id=$1 AND decision IS NULL ORDER BY renewal_date LIMIT 1 FOR UPDATE`, [s.id])).rows[0];
    if (!rn) throw new AppError("There is no renewal waiting for a decision", 409);
    if (rn.owner_user_id !== user.id) await c.query(`UPDATE subscription_renewals SET owner_user_id=$2 WHERE id=$1`, [rn.id, user.id]);
    await c.query(`UPDATE subscription_renewals SET decision=$2,decided_by_user_id=$3,decided_at=now(),decision_note=$4 WHERE id=$1`, [rn.id, decision, user.id, note]);
    let bill: Record<string, unknown> | null = null;
    if (decision === "renew") {
      const interval = CYCLE_INTERVAL[s.billing_frequency];
      if (!interval) throw new AppError("A one-off purchase does not renew", 409);
      // A rate frozen on the subscription (imported, non-USD) wins; otherwise the request's USD rate. Never guess a EUR/CHF rate.
      const rate = s.aed_rate ? s.aed_rate : s.currency === "USD" || s.currency === "AED" ? await rateFor(c, s.request_id) : null, cents = BigInt(s.amount_cents);
      if (!rate) throw new AppError(`No AED rate is recorded for this ${s.currency} subscription; ask an admin to set one`, 409);
      bill = (await c.query(`INSERT INTO subscription_bills(subscription_id,kind,renewal_id,request_id,period_start,period_end,tool,company_name,amount_cents,currency,usd_to_aed_rate,amount_aed_cents,card_last4,approved_by_user_id,created_by_user_id,beneficiary)
        VALUES($1,'renewal',$2,$3,$4::date,($4::date+$5::interval)::date,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14) RETURNING *`,
        [s.id, rn.id, s.request_id, rn.renewal_date, interval, s.name, s.company_name, cents.toString(), s.currency, rate, aed(cents, s.currency, rate).toString(), s.card_last4, user.id, s.beneficiary])).rows[0];
      await c.query(`UPDATE subscriptions SET renewal_date=($2::date+$3::interval)::date,status='active',renewal_flagged_at=NULL,cancel_at=NULL WHERE id=$1`, [s.id, rn.renewal_date, interval]);
    } else {
      await c.query(`UPDATE subscriptions SET cancel_at=$2::date,renewal_flagged_at=NULL,status=CASE WHEN $2::date<=current_date THEN 'cancelled'::subscription_status ELSE 'active'::subscription_status END WHERE id=$1`, [s.id, rn.renewal_date]);
    }
    await c.query(`INSERT INTO audit_log(actor_id,request_id,action,after_data,ip_hash) VALUES($1,$2,$3,$4,$5)`,
      [user.id, s.request_id, decision === "renew" ? "subscription.renewed" : "subscription.declined", JSON.stringify({ subscriptionId: s.id, renewalId: rn.id, renewalDate: rn.renewal_date, note, bill }), ipHash]);
    return { name: s.name, renewalDate: rn.renewal_date, bill };
  });
  const admins = await query<{ email: string }>(`SELECT email FROM users WHERE 'admin'=ANY(roles) AND disabled_at IS NULL`);
  for (const a of admins.rows) await notice(`renewal-${decision}:${subscriptionId}:${result.renewalDate}:${a.email}`, a.email, decision === "renew" ? `Renewed: ${result.name}` : `Not renewing: ${result.name}`,
    decision === "renew" ? `${user.name} renewed ${result.name}. A bill was written.` : `${user.name} declined the renewal of ${result.name}. It cancels on ${result.renewalDate}; nothing will be charged.${note ? `\nNote: ${note}` : ""}`, "/subscriptions");
  return { decision, renewalDate: result.renewalDate, billId: result.bill?.id ?? null };
}

// Worker step. Idempotent: unique keys make every step safe to run every tick.
export async function runRenewals() {
  const rules = await getRules(), lead = rules.renewalLeadDays, out = { reminded: 0, flagged: 0, cancelled: 0 };
  // 1. Remind the owner once per renewal date, lead days ahead (or straight away if it is closer).
  const due = await query<{ id: string; name: string; renewal_date: string; owner_user_id: string; email: string; amount_cents: string; currency: string }>(
    `SELECT s.id,s.name,to_char(s.renewal_date,'YYYY-MM-DD') renewal_date,s.owner_user_id,u.email,s.amount_cents::text,s.currency FROM subscriptions s JOIN users u ON u.id=s.owner_user_id
      WHERE s.status IN ('active','renewal_due') AND s.renewal_date IS NOT NULL AND s.cancel_at IS NULL AND s.billing_frequency<>'one_off'
        AND s.renewal_date-$1::int<=current_date AND NOT EXISTS (SELECT 1 FROM subscription_renewals r WHERE r.subscription_id=s.id AND r.renewal_date=s.renewal_date)`, [lead]);
  for (const s of due.rows) {
    const ins = await query(`INSERT INTO subscription_renewals(subscription_id,renewal_date,owner_user_id) VALUES($1,$2,$3) ON CONFLICT (subscription_id,renewal_date) DO NOTHING RETURNING id`, [s.id, s.renewal_date, s.owner_user_id]);
    if (!ins.rowCount) continue;
    await query(`UPDATE subscriptions SET status='renewal_due' WHERE id=$1 AND status='active'`, [s.id]);
    await notice(`renewal-reminder:${s.id}:${s.renewal_date}`, s.email, `Renew ${s.name}?`,
      `${s.name} renews on ${s.renewal_date} for ${money(s.amount_cents, s.currency)}. It will only renew if you choose Renew in the portal. If you do nothing, it is flagged on that date and nothing is charged.`, "/subscriptions");
    out.reminded++;
  }
  // 2. No answer by the renewal date: flag it, charge nothing, tell the owner and the admins.
  const missed = await query<{ id: string; subscription_id: string; name: string; renewal_date: string; email: string | null }>(
    `UPDATE subscription_renewals r SET flagged_at=now() FROM subscriptions s LEFT JOIN users u ON u.id=s.owner_user_id
      WHERE s.id=r.subscription_id AND r.decision IS NULL AND r.flagged_at IS NULL AND r.renewal_date<current_date
      RETURNING r.id,r.subscription_id,s.name,to_char(r.renewal_date,'YYYY-MM-DD') renewal_date,u.email`);
  for (const m of missed.rows) {
    await query(`UPDATE subscriptions SET renewal_flagged_at=coalesce(renewal_flagged_at,now()),status='renewal_due' WHERE id=$1`, [m.subscription_id]);
    await query(`INSERT INTO audit_log(action,after_data) VALUES('subscription.renewal_missed',$1)`, [JSON.stringify({ subscriptionId: m.subscription_id, renewalId: m.id, renewalDate: m.renewal_date, charged: false })]);
    const admins = await query<{ email: string }>(`SELECT email FROM users WHERE 'admin'=ANY(roles) AND disabled_at IS NULL`);
    for (const to of [...(m.email ? [m.email] : []), ...admins.rows.map(a => a.email)])
      await notice(`renewal-missed:${m.id}:${to}`, to, `No answer: ${m.name} not renewed`, `Nobody chose Renew or Decline for ${m.name} by ${m.renewal_date}. It has been flagged and nothing was charged. The owner can still decide in the portal.`, "/subscriptions");
    out.flagged++;
  }
  // 3. A declined subscription ends at its term end.
  const ended = await query(`UPDATE subscriptions SET status='cancelled' WHERE cancel_at IS NOT NULL AND cancel_at<=current_date AND status<>'cancelled' RETURNING id`);
  for (const e of ended.rows) await query(`INSERT INTO audit_log(action,after_data) VALUES('subscription.cancelled_at_term_end',$1)`, [JSON.stringify({ subscriptionId: e.id })]);
  out.cancelled = ended.rowCount ?? 0;
  return out;
}

export const billFilterSchema = z.object({ company: z.string().trim().max(200).optional().default(""), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")) });
export type BillRow = { id: string; billed_on: string; tool: string; beneficiary: string; company_name: string; kind: string; amount_cents: string; currency: string; usd_to_aed_rate: string; amount_aed_cents: string; card_last4: string; approved_by: string | null; request_id: string | null; request_ref: string | null };
export async function listBills(user: User, f: z.infer<typeof billFilterSchema>) {
  if (!canSeeBills(user)) throw forbidden();
  const r = await query<BillRow & { rq_type: string | null; rq_created: string | null }>(`SELECT b.id,to_char(b.billed_on,'YYYY-MM-DD') billed_on,b.tool,coalesce(nullif(b.beneficiary,''),s.beneficiary,'') beneficiary,b.company_name,b.kind,b.amount_cents::text,b.currency,b.usd_to_aed_rate::text,b.amount_aed_cents::text,b.card_last4,
      a.name approved_by,b.request_id,rq.type rq_type,rq.created_at rq_created FROM subscription_bills b JOIN subscriptions s ON s.id=b.subscription_id LEFT JOIN users a ON a.id=b.approved_by_user_id LEFT JOIN requests rq ON rq.id=b.request_id
      WHERE ($1='' OR b.company_name=$1) AND ($2::date IS NULL OR b.billed_on>=$2::date) AND ($3::date IS NULL OR b.billed_on<=$3::date) ORDER BY b.billed_on DESC, b.created_at DESC LIMIT 5000`,
    [f.company || "", f.from || null, f.to || null]);
  const rows = r.rows.map(({ rq_type, rq_created, ...b }) => ({ ...b, request_ref: b.request_id && rq_type ? refFor(rq_type, b.request_id, String(rq_created)) : null }));
  const companies = (await query<{ c: string }>(`SELECT DISTINCT company_name c FROM subscription_bills WHERE company_name<>'' ORDER BY 1`)).rows.map(x => x.c);
  return { rows, companies, totalAedCents: rows.reduce((s, b) => s + BigInt(b.amount_aed_cents), 0n).toString() };
}

// CSV for the bill history. Card is last 4 only; cells that a spreadsheet would run as a formula are quoted as text.
export function billsCsv(rows: BillRow[]) {
  const dec = (c: string) => { const v = BigInt(c); return `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`; };
  const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Billed on", "Tool", "Beneficiary", "Company", "Kind", "Amount", "Currency", "Amount (AED)", "AED rate", "Card (last 4)", "Approved by", "Request", "Request link"];
  const lines = rows.map(b => [b.billed_on, b.tool, b.beneficiary, b.company_name, b.kind, dec(b.amount_cents), b.currency, dec(b.amount_aed_cents), b.usd_to_aed_rate, b.card_last4 ? `•••• ${b.card_last4}` : "", b.approved_by ?? "", b.request_ref ?? "", b.request_id ? new URL(`/requests/${b.request_id}`, base()).href : ""].map(cell).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n") + "\r\n";
}
