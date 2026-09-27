import { z } from "zod";
import { query, transaction } from "./db";
import { AppError } from "./errors";
import { getSetting } from "./settings";
import { button, emailShell, para, rowsTable } from "./email-layout";
import { buildXlsx, type Cell } from "./xlsx";

// The monthly subscriptions statement for accounting. It reconciles in AED, the currency the card is
// billed in: opening balance + charges (subscription bills) - credits (card payments and refunds) =
// closing. Every charge carries its beneficiary and company. The statement is generated from the
// append-only bill and credit tables, so regenerating a month gives the same lines.

export const accountingSchema = z.object({
  recipientEmail: z.string().trim().toLowerCase().email().max(254).or(z.literal("")),
  openingBalanceAedCents: z.string().regex(/^-?\d{1,15}$/),
  openingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  // The day the card cycle starts (1-28). 1 = calendar months; 16 = the 16th to the 15th.
  cycleDay: z.number().int().min(1).max(28),
});
export type Accounting = z.infer<typeof accountingSchema>;
export const DEFAULT_ACCOUNTING: Accounting = { recipientEmail: "", openingBalanceAedCents: "0", openingMonth: "2026-09", cycleDay: 1 };
export async function getAccounting(): Promise<Accounting> {
  const v = await getSetting<Partial<Accounting>>("accounting", {}), p = accountingSchema.safeParse({ ...DEFAULT_ACCOUNTING, ...v });
  return p.success ? p.data : DEFAULT_ACCOUNTING;
}

export const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const firstDay = (m: string) => `${m}-01`;
export const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
export const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
// A statement is named by the month it closes in, like the card statement. With cycle day 16,
// "2026-09" runs from 16 Aug to 15 Sep. With cycle day 1 it is the calendar month.
export const periodStart = (m: string, cycleDay: number) => cycleDay <= 1 ? `${m}-01` : `${prevMonth(m)}-${String(cycleDay).padStart(2, "0")}`;
export const periodEndExclusive = (m: string, cycleDay: number) => periodStart(nextMonth(m), cycleDay);
export const periodLastDay = (m: string, cycleDay: number) => { const d = new Date(`${periodEndExclusive(m, cycleDay)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

export type StatementLine = { id: string; date: string; kind: "charge" | "payment" | "refund"; reference: string; service: string; description: string; beneficiary: string; company: string; original: string; debitAedCents: string; creditAedCents: string; approvedBy: string; locked: boolean };
export type Breakdown = { name: string; aedCents: string; creditsAedCents: string; count: number };
export type Statement = { month: string; periodStart: string; periodEnd: string; openingAedCents: string; chargesAedCents: string; creditsAedCents: string; closingAedCents: string; lines: StatementLine[];
  byBeneficiary: Breakdown[]; byCompany: Breakdown[];
  stored: { generatedAt: string; sentAt: string | null; sentBy: string | null; emailState: string | null; recipient: string | null } | null; accounting: Accounting };

const dec = (c: bigint | string) => { const v = BigInt(c), neg = v < 0n, a = neg ? -v : v; return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`; };
// The statement a date belongs to: the month its cycle closes in.
export const statementMonthFor = (date: string, cycleDay: number) => { const m = date.slice(0, 7); return cycleDay > 1 && Number(date.slice(8, 10)) >= cycleDay ? nextMonth(m) : m; };

export async function buildStatement(month: string): Promise<Statement> {
  if (!monthRe.test(month)) throw new AppError("Month must look like 2026-09");
  const acc = await getAccounting();
  if (month < acc.openingMonth) throw new AppError(`Statements start from ${acc.openingMonth}, the month the opening balance was entered for`, 409);
  const cd = acc.cycleDay, from = periodStart(month, cd), to = periodEndExclusive(month, cd);
  // Opening = the entered opening balance + everything charged minus everything credited before this month.
  const before = (await query<{ charges: string; credits: string }>(`SELECT
      (SELECT coalesce(sum(amount_aed_cents),0)::text FROM subscription_bills WHERE billed_on >= $1::date AND billed_on < $2::date) charges,
      (SELECT coalesce(sum(amount_aed_cents),0)::text FROM statement_credits WHERE occurred_on >= $1::date AND occurred_on < $2::date) credits`, [periodStart(acc.openingMonth, cd), from])).rows[0];
  const opening = BigInt(acc.openingBalanceAedCents) + BigInt(before.charges) - BigInt(before.credits);
  const bills = (await query<{ billed_on: string; id: string; tool: string; beneficiary: string; company_name: string; amount_cents: string; currency: string; amount_aed_cents: string; approved_by: string | null; request_id: string | null; locked: boolean }>(
    `SELECT to_char(b.billed_on,'YYYY-MM-DD') billed_on,b.id,b.tool,coalesce(nullif(b.beneficiary,''),s.beneficiary,'') beneficiary,b.company_name,b.amount_cents::text,b.currency,b.amount_aed_cents::text,coalesce(u.name,CASE WHEN b.kind='phone' THEN 'Phone: '||b.phone_approved_by END) approved_by,b.request_id,b.locked_at IS NOT NULL locked
       FROM subscription_bills b JOIN subscriptions s ON s.id=b.subscription_id LEFT JOIN users u ON u.id=b.approved_by_user_id
      WHERE b.billed_on >= $1::date AND b.billed_on < $2::date ORDER BY b.billed_on, b.created_at`, [from, to])).rows;
  const credits = (await query<{ occurred_on: string; id: string; kind: "payment" | "refund"; amount_aed_cents: string; description: string; beneficiary: string; company_name: string; locked: boolean }>(
    `SELECT to_char(occurred_on,'YYYY-MM-DD') occurred_on,id,kind,amount_aed_cents::text,description,beneficiary,company_name,locked_at IS NOT NULL locked FROM statement_credits WHERE occurred_on >= $1::date AND occurred_on < $2::date ORDER BY occurred_on, created_at`,
    [from, to])).rows;
  const lines: StatementLine[] = [
    ...bills.map(b => ({ id: b.id, date: b.billed_on, kind: "charge" as const, reference: `BILL-${b.id.slice(0, 8).toUpperCase()}`, service: b.tool, description: "", beneficiary: b.beneficiary || "—", company: b.company_name || "—",
      original: `${b.currency} ${dec(b.amount_cents)}`, debitAedCents: b.amount_aed_cents, creditAedCents: "0", approvedBy: b.approved_by || "—", locked: b.locked })),
    ...credits.map(c => ({ id: c.id, date: c.occurred_on, kind: c.kind, reference: `CR-${c.id.slice(0, 8).toUpperCase()}`, service: c.description || (c.kind === "payment" ? "Card payment" : "Refund"), description: c.description, beneficiary: c.beneficiary || "—", company: c.company_name || "—",
      original: `AED ${dec(c.amount_aed_cents)}`, debitAedCents: "0", creditAedCents: c.amount_aed_cents, approvedBy: "—", locked: c.locked })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const charges = bills.reduce((s, b) => s + BigInt(b.amount_aed_cents), 0n), creditSum = credits.reduce((s, c) => s + BigInt(c.amount_aed_cents), 0n);
  // Per person and per company: what was charged to them, and what was paid or refunded for them.
  const group = (pick: (l: StatementLine) => string) => [...lines.reduce((m, l) => { const k = pick(l) || "—", g = m.get(k) ?? { aed: 0n, cr: 0n, count: 0 }; g.aed += BigInt(l.debitAedCents); g.cr += BigInt(l.creditAedCents); g.count++; return m.set(k, g); }, new Map<string, { aed: bigint; cr: bigint; count: number }>())]
    .map(([name, g]) => ({ name, aedCents: g.aed.toString(), creditsAedCents: g.cr.toString(), count: g.count })).sort((a, b) => Number(BigInt(b.aedCents) - BigInt(a.aedCents)));
  const st = (await query<{ generated_at: string; sent_at: string | null; sent_by: string | null; state: string | null; recipient: string | null }>(
    `SELECT m.generated_at,m.sent_at,u.name sent_by,o.state,o.recipient FROM monthly_statements m LEFT JOIN users u ON u.id=m.sent_by_user_id LEFT JOIN email_outbox o ON o.id=m.email_outbox_id WHERE m.month=$1::date`, [firstDay(month)])).rows[0];
  return { month, periodStart: from, periodEnd: periodLastDay(month, cd), openingAedCents: opening.toString(), chargesAedCents: charges.toString(), creditsAedCents: creditSum.toString(), closingAedCents: (opening + charges - creditSum).toString(), lines,
    byBeneficiary: group(l => l.beneficiary), byCompany: group(l => l.company),
    stored: st ? { generatedAt: st.generated_at, sentAt: st.sent_at, sentBy: st.sent_by, emailState: st.state, recipient: st.recipient } : null, accounting: acc };
}

// Excel workbook: the statement (right-to-left, Arabic headers), then the two breakdowns.
export function statementXlsx(s: Statement) {
  const n = (c: string) => Number(dec(c));
  const head: Cell[] = ["التاريخ", "المرجع", "الخدمة", "المستفيد", "الشركة", "المبلغ الأصلي", "مدين (درهم)", "دائن (درهم)", "الرصيد (درهم)", "اعتمده"];
  let bal = BigInt(s.openingAedCents);
  const rows: Cell[][] = [head, [s.periodStart, "", "الرصيد الافتتاحي", "", "", "", null, null, n(s.openingAedCents), ""],
    ...s.lines.map(l => { bal += BigInt(l.debitAedCents) - BigInt(l.creditAedCents); return [l.date, l.reference, l.service, l.beneficiary, l.company, l.original, l.debitAedCents === "0" ? null : n(l.debitAedCents), l.creditAedCents === "0" ? null : n(l.creditAedCents), n(bal.toString()), l.approvedBy] as Cell[]; }),
    ["", "", "الرصيد الختامي", "", "", "", n(s.chargesAedCents), n(s.creditsAedCents), n(s.closingAedCents), ""]];
  const breakdown = (title: string, g: Statement["byBeneficiary"]): Cell[][] => [[title, "عدد الحركات", "المصروفات (درهم)", "الدفعات والاستردادات (درهم)", "الصافي (درهم)"], ...g.map(x => [x.name, x.count, n(x.aedCents), n(x.creditsAedCents), n((BigInt(x.aedCents) - BigInt(x.creditsAedCents)).toString())] as Cell[])];
  return buildXlsx([
    { name: `كشف ${s.month}`, rtl: true, rows, widths: [12, 16, 40, 28, 18, 16, 14, 14, 14, 18] },
    { name: "حسب المستفيد", rtl: true, rows: breakdown("المستفيد", s.byBeneficiary), widths: [36, 12, 16, 22, 16] },
    { name: "حسب الشركة", rtl: true, rows: breakdown("الشركة", s.byCompany), widths: [36, 12, 16, 22, 16] },
  ]);
}

const base = () => process.env.NEXTAUTH_URL || "http://localhost:3000";

// Generate (or refresh, while unsent) the stored statement and its email to accounting. The email is
// always created 'held': a person reviews it in the portal and presses Send.
export async function generateStatement(month: string, userId: string | null) {
  const s = await buildStatement(month);
  const to = s.accounting.recipientEmail;
  if (!to) throw new AppError("Set the accounting email address first", 409);
  const file = statementXlsx(s), filename = `sankari-subscriptions-statement-${month}.xlsx`;
  const url = new URL(`/admin/statements?month=${month}`, base()).href, subject = `[Sankari] كشف الاشتراكات ${month} · Subscriptions statement`;
  const summary: [string, string][] = [["الرصيد الافتتاحي · Opening", dec(s.openingAedCents)], ["المصروفات · Charges", dec(s.chargesAedCents)], ["الدفعات والاستردادات · Payments & refunds", dec(s.creditsAedCents)], ["الرصيد الختامي · Closing", dec(s.closingAedCents)]];
  const html = emailShell(`كشف الاشتراكات لشهر ${month}`, `${para(`مرفق كشف الاشتراكات لشهر ${month} (من ${s.periodStart} إلى ${s.periodEnd}) بصيغة Excel، مع التفصيل حسب المستفيد وحسب الشركة. المبالغ بالدرهم الإماراتي.`)}${rowsTable(summary.map(([k, v]) => [k, `AED ${v}`] as [string, string]))}<p style="margin:20px 0 0;font-size:13px;color:#5E564D">${s.lines.length} حركة</p><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:14px">${button(url, "عرض الكشف في البوابة")}</td></tr></table>`, { lang: "ar" });
  const text = `Sankari Holding — Subscriptions statement ${month} (${s.periodStart} to ${s.periodEnd})\n\n${summary.map(([k, v]) => `${k}: AED ${v}`).join("\n")}\n\n${s.lines.length} lines. The Excel file is attached.\nView in the portal: ${url}`;
  return transaction(async c => {
    const existing = (await c.query<{ id: string; sent_at: string | null; email_outbox_id: string | null }>(`SELECT id,sent_at,email_outbox_id FROM monthly_statements WHERE month=$1::date FOR UPDATE`, [firstDay(month)])).rows[0];
    if (existing?.sent_at) throw new AppError("This month's statement was already sent to accounting", 409);
    const att = JSON.stringify([{ filename, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: file.toString("base64") }]);
    let outboxId = existing?.email_outbox_id ?? null;
    if (outboxId) await c.query(`UPDATE email_outbox SET recipient=lower($2),subject=$3,html=$4,text_body=$5,attachments=$6 WHERE id=$1 AND state='held'`, [outboxId, to, subject, html, text, att]);
    else outboxId = (await c.query<{ id: string }>(`INSERT INTO email_outbox(event_key,recipient,subject,html,text_body,state,attachments) VALUES($1,lower($2),$3,$4,$5,'held',$6) RETURNING id`, [`statement:${month}`, to, subject, html, text, att])).rows[0].id;
    const vals = [firstDay(month), s.openingAedCents, s.chargesAedCents, s.creditsAedCents, s.closingAedCents, s.lines.length, userId, outboxId];
    if (existing) await c.query(`UPDATE monthly_statements SET opening_aed_cents=$2,charges_aed_cents=$3,credits_aed_cents=$4,closing_aed_cents=$5,lines=$6,generated_at=now(),generated_by_user_id=$7,email_outbox_id=$8 WHERE month=$1::date`, vals);
    else await c.query(`INSERT INTO monthly_statements(month,opening_aed_cents,charges_aed_cents,credits_aed_cents,closing_aed_cents,lines,generated_by_user_id,email_outbox_id) VALUES($1::date,$2,$3,$4,$5,$6,$7,$8)`, vals);
    await c.query(`INSERT INTO audit_log(actor_id,action,after_data) VALUES($1,'statement.generated',$2)`, [userId, JSON.stringify({ month, opening: s.openingAedCents, charges: s.chargesAedCents, credits: s.creditsAedCents, closing: s.closingAedCents, lines: s.lines.length, recipient: to })]);
    return { month, lines: s.lines.length, closingAedCents: s.closingAedCents };
  });
}

// A person presses Send: the held email is released to the worker. Never automatic.
export async function sendStatement(month: string, userId: string, ipHash: string) {
  const cd = (await getAccounting()).cycleDay, from = periodStart(month, cd), to = periodEndExclusive(month, cd);
  return transaction(async c => {
    const m = (await c.query<{ id: string; sent_at: string | null; email_outbox_id: string | null }>(`SELECT id,sent_at,email_outbox_id FROM monthly_statements WHERE month=$1::date FOR UPDATE`, [firstDay(month)])).rows[0];
    if (!m?.email_outbox_id) throw new AppError("Generate the statement first", 409);
    if (m.sent_at) throw new AppError("Already sent", 409);
    const r = await c.query(`UPDATE email_outbox SET state='pending',next_attempt_at=now() WHERE id=$1 AND state='held'`, [m.email_outbox_id]);
    if (!r.rowCount) throw new AppError("The statement email is not waiting to be sent", 409);
    await c.query(`UPDATE monthly_statements SET sent_at=now(),sent_by_user_id=$2 WHERE id=$1`, [m.id, userId]);
    // From now on the period's lines are fixed; a correction is a new line.
    await c.query(`UPDATE statement_credits SET locked_at=now() WHERE occurred_on >= $1::date AND occurred_on < $2::date AND locked_at IS NULL`, [from, to]);
    await c.query(`UPDATE subscription_bills SET locked_at=now() WHERE billed_on >= $1::date AND billed_on < $2::date AND locked_at IS NULL`, [from, to]);
    await c.query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'statement.sent',$2,$3)`, [userId, JSON.stringify({ month }), ipHash]);
    return { month, sent: true };
  });
}

export const creditSchema = z.object({ occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["payment", "refund"]), amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount: up to 2 decimals"), description: z.string().trim().max(300).default(""), beneficiary: z.string().trim().max(160).default(""), companyName: z.string().trim().max(160).default("") });
export async function addCredit(input: z.infer<typeof creditSchema>, userId: string, ipHash: string) {
  const [w, f = ""] = input.amount.split("."), cents = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  if (cents <= 0n) throw new AppError("Amount must be more than zero");
  const r = (await query<{ id: string }>(`INSERT INTO statement_credits(occurred_on,kind,amount_aed_cents,description,beneficiary,company_name,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [input.occurredOn, input.kind, cents.toString(), input.description, input.beneficiary, input.companyName, userId])).rows[0];
  await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'statement.credit_added',$2,$3)`, [userId, JSON.stringify({ id: r.id, ...input, amountAedCents: cents.toString() }), ipHash]);
  return r;
}

// Corrections before the statement goes out. A payment or refund can change in full; a charge only its
// beneficiary and company (its amount, date and rate come from the renewal decision). Once the
// statement covering the line has been sent, the line is fixed (the database refuses too).
async function assertOpen(c: { query: typeof query }, dates: string[]) {
  const cd = (await getAccounting()).cycleDay;
  for (const d of dates) {
    const m = statementMonthFor(d, cd);
    if ((await c.query(`SELECT 1 FROM monthly_statements WHERE month=$1::date AND sent_at IS NOT NULL`, [firstDay(m)])).rowCount) throw new AppError(`The ${m} statement was already sent to accounting; add a correcting line instead`, 409);
  }
}
export const lineEditSchema = z.discriminatedUnion("type", [
  creditSchema.extend({ type: z.literal("credit") }),
  z.object({ type: z.literal("charge"), beneficiary: z.string().trim().max(160).default(""), companyName: z.string().trim().max(160).default("") }),
]);
export async function editLine(id: string, input: z.infer<typeof lineEditSchema>, userId: string, ipHash: string) {
  return transaction(async c => {
    if (input.type === "credit") {
      const old = (await c.query<{ occurred_on: string; locked_at: string | null }>(`SELECT to_char(occurred_on,'YYYY-MM-DD') occurred_on,locked_at,kind,amount_aed_cents::text,description,beneficiary,company_name FROM statement_credits WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!old) throw new AppError("Line not found", 404);
      if (old.locked_at) throw new AppError("This line was sent to accounting and is fixed; add a correcting line instead", 409);
      await assertOpen(c, [old.occurred_on, input.occurredOn]);
      const [w, f = ""] = input.amount.split("."), cents = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
      if (cents <= 0n) throw new AppError("Amount must be more than zero");
      const next = { occurred_on: input.occurredOn, kind: input.kind, amount_aed_cents: cents.toString(), description: input.description, beneficiary: input.beneficiary, company_name: input.companyName };
      await c.query(`UPDATE statement_credits SET occurred_on=$2,kind=$3,amount_aed_cents=$4,description=$5,beneficiary=$6,company_name=$7,updated_at=now() WHERE id=$1`, [id, next.occurred_on, next.kind, next.amount_aed_cents, next.description, next.beneficiary, next.company_name]);
      await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'statement.credit_edited',$2,$3,$4)`, [userId, JSON.stringify({ id, ...old }), JSON.stringify({ id, ...next }), ipHash]);
    } else {
      const old = (await c.query<{ billed_on: string; locked_at: string | null }>(`SELECT to_char(billed_on,'YYYY-MM-DD') billed_on,locked_at,beneficiary,company_name FROM subscription_bills WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!old) throw new AppError("Line not found", 404);
      if (old.locked_at) throw new AppError("This charge was sent to accounting and is fixed", 409);
      await assertOpen(c, [old.billed_on]);
      await c.query(`UPDATE subscription_bills SET beneficiary=$2,company_name=$3 WHERE id=$1`, [id, input.beneficiary, input.companyName]);
      await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'statement.charge_edited',$2,$3,$4)`, [userId, JSON.stringify({ id, ...old }), JSON.stringify({ id, beneficiary: input.beneficiary, company_name: input.companyName }), ipHash]);
    }
    return { id, saved: true };
  });
}

// Worker: the morning after a cycle closes (06:00 Istanbul), prepare that statement (held).
// Which statement is due at this moment: the latest one whose cycle has closed. On the closing
// morning itself it waits until 06:00. With cycle day 1 that is last month, from the 1st.
export function statementMonthDue(now: Date, cycleDay = 1) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map(x => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`;
  let m = `${p.year}-${p.month}`;
  if (periodEndExclusive(m, cycleDay) > today) m = prevMonth(m);
  return periodEndExclusive(m, cycleDay) === today && Number(p.hour) < 6 ? null : m;
}
export async function runMonthlyStatement(now = new Date()) {
  const acc = await getAccounting(), month = statementMonthDue(now, acc.cycleDay);
  if (!month) return null;
  if (!acc.recipientEmail || month < acc.openingMonth) return null;
  if ((await query(`SELECT 1 FROM monthly_statements WHERE month=$1::date`, [firstDay(month)])).rowCount) return null;
  return generateStatement(month, null);
}
