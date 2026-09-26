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
});
export type Accounting = z.infer<typeof accountingSchema>;
export const DEFAULT_ACCOUNTING: Accounting = { recipientEmail: "", openingBalanceAedCents: "0", openingMonth: "2026-09" };
export async function getAccounting(): Promise<Accounting> {
  const v = await getSetting<Partial<Accounting>>("accounting", {}), p = accountingSchema.safeParse({ ...DEFAULT_ACCOUNTING, ...v });
  return p.success ? p.data : DEFAULT_ACCOUNTING;
}

export const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const firstDay = (m: string) => `${m}-01`;
export const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
export const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };

export type StatementLine = { date: string; kind: "charge" | "payment" | "refund"; reference: string; service: string; beneficiary: string; company: string; original: string; debitAedCents: string; creditAedCents: string; approvedBy: string };
export type Statement = { month: string; openingAedCents: string; chargesAedCents: string; creditsAedCents: string; closingAedCents: string; lines: StatementLine[];
  byBeneficiary: { name: string; aedCents: string; count: number }[]; byCompany: { name: string; aedCents: string; count: number }[];
  stored: { generatedAt: string; sentAt: string | null; sentBy: string | null; emailState: string | null; recipient: string | null } | null; accounting: Accounting };

const dec = (c: bigint | string) => { const v = BigInt(c), neg = v < 0n, a = neg ? -v : v; return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`; };

export async function buildStatement(month: string): Promise<Statement> {
  if (!monthRe.test(month)) throw new AppError("Month must look like 2026-09");
  const acc = await getAccounting();
  if (month < acc.openingMonth) throw new AppError(`Statements start from ${acc.openingMonth}, the month the opening balance was entered for`, 409);
  // Opening = the entered opening balance + everything charged minus everything credited before this month.
  const before = (await query<{ charges: string; credits: string }>(`SELECT
      (SELECT coalesce(sum(amount_aed_cents),0)::text FROM subscription_bills WHERE billed_on >= $1::date AND billed_on < $2::date) charges,
      (SELECT coalesce(sum(amount_aed_cents),0)::text FROM statement_credits WHERE occurred_on >= $1::date AND occurred_on < $2::date) credits`, [firstDay(acc.openingMonth), firstDay(month)])).rows[0];
  const opening = BigInt(acc.openingBalanceAedCents) + BigInt(before.charges) - BigInt(before.credits);
  const bills = (await query<{ billed_on: string; id: string; tool: string; beneficiary: string; company_name: string; amount_cents: string; currency: string; amount_aed_cents: string; approved_by: string | null; request_id: string | null }>(
    `SELECT to_char(b.billed_on,'YYYY-MM-DD') billed_on,b.id,b.tool,coalesce(nullif(b.beneficiary,''),s.beneficiary,'') beneficiary,b.company_name,b.amount_cents::text,b.currency,b.amount_aed_cents::text,u.name approved_by,b.request_id
       FROM subscription_bills b JOIN subscriptions s ON s.id=b.subscription_id LEFT JOIN users u ON u.id=b.approved_by_user_id
      WHERE b.billed_on >= $1::date AND b.billed_on < $2::date ORDER BY b.billed_on, b.created_at`, [firstDay(month), firstDay(nextMonth(month))])).rows;
  const credits = (await query<{ occurred_on: string; id: string; kind: "payment" | "refund"; amount_aed_cents: string; description: string }>(
    `SELECT to_char(occurred_on,'YYYY-MM-DD') occurred_on,id,kind,amount_aed_cents::text,description FROM statement_credits WHERE occurred_on >= $1::date AND occurred_on < $2::date ORDER BY occurred_on, created_at`,
    [firstDay(month), firstDay(nextMonth(month))])).rows;
  const lines: StatementLine[] = [
    ...bills.map(b => ({ date: b.billed_on, kind: "charge" as const, reference: `BILL-${b.id.slice(0, 8).toUpperCase()}`, service: b.tool, beneficiary: b.beneficiary || "—", company: b.company_name || "—",
      original: `${b.currency} ${dec(b.amount_cents)}`, debitAedCents: b.amount_aed_cents, creditAedCents: "0", approvedBy: b.approved_by || "—" })),
    ...credits.map(c => ({ date: c.occurred_on, kind: c.kind, reference: `CR-${c.id.slice(0, 8).toUpperCase()}`, service: c.description || (c.kind === "payment" ? "Card payment" : "Refund"), beneficiary: "—", company: "—",
      original: `AED ${dec(c.amount_aed_cents)}`, debitAedCents: "0", creditAedCents: c.amount_aed_cents, approvedBy: "—" })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const charges = bills.reduce((s, b) => s + BigInt(b.amount_aed_cents), 0n), creditSum = credits.reduce((s, c) => s + BigInt(c.amount_aed_cents), 0n);
  const group = (key: (b: typeof bills[number]) => string) => [...bills.reduce((m, b) => { const k = key(b) || "—", g = m.get(k) ?? { aed: 0n, count: 0 }; g.aed += BigInt(b.amount_aed_cents); g.count++; return m.set(k, g); }, new Map<string, { aed: bigint; count: number }>())]
    .map(([name, g]) => ({ name, aedCents: g.aed.toString(), count: g.count })).sort((a, b) => Number(BigInt(b.aedCents) - BigInt(a.aedCents)));
  const st = (await query<{ generated_at: string; sent_at: string | null; sent_by: string | null; state: string | null; recipient: string | null }>(
    `SELECT m.generated_at,m.sent_at,u.name sent_by,o.state,o.recipient FROM monthly_statements m LEFT JOIN users u ON u.id=m.sent_by_user_id LEFT JOIN email_outbox o ON o.id=m.email_outbox_id WHERE m.month=$1::date`, [firstDay(month)])).rows[0];
  return { month, openingAedCents: opening.toString(), chargesAedCents: charges.toString(), creditsAedCents: creditSum.toString(), closingAedCents: (opening + charges - creditSum).toString(), lines,
    byBeneficiary: group(b => b.beneficiary), byCompany: group(b => b.company_name),
    stored: st ? { generatedAt: st.generated_at, sentAt: st.sent_at, sentBy: st.sent_by, emailState: st.state, recipient: st.recipient } : null, accounting: acc };
}

// Excel workbook: the statement (right-to-left, Arabic headers), then the two breakdowns.
export function statementXlsx(s: Statement) {
  const n = (c: string) => Number(dec(c));
  const head: Cell[] = ["التاريخ", "المرجع", "الخدمة", "المستفيد", "الشركة", "المبلغ الأصلي", "مدين (درهم)", "دائن (درهم)", "الرصيد (درهم)", "اعتمده"];
  let bal = BigInt(s.openingAedCents);
  const rows: Cell[][] = [head, [`${s.month}-01`, "", "الرصيد الافتتاحي", "", "", "", null, null, n(s.openingAedCents), ""],
    ...s.lines.map(l => { bal += BigInt(l.debitAedCents) - BigInt(l.creditAedCents); return [l.date, l.reference, l.service, l.beneficiary, l.company, l.original, l.debitAedCents === "0" ? null : n(l.debitAedCents), l.creditAedCents === "0" ? null : n(l.creditAedCents), n(bal.toString()), l.approvedBy] as Cell[]; }),
    ["", "", "الرصيد الختامي", "", "", "", n(s.chargesAedCents), n(s.creditsAedCents), n(s.closingAedCents), ""]];
  const breakdown = (title: string, g: Statement["byBeneficiary"]): Cell[][] => [[title, "عدد الحركات", "المجموع (درهم)"], ...g.map(x => [x.name, x.count, n(x.aedCents)] as Cell[])];
  return buildXlsx([
    { name: `كشف ${s.month}`, rtl: true, rows, widths: [12, 16, 40, 28, 18, 16, 14, 14, 14, 18] },
    { name: "حسب المستفيد", rtl: true, rows: breakdown("المستفيد", s.byBeneficiary), widths: [36, 12, 16] },
    { name: "حسب الشركة", rtl: true, rows: breakdown("الشركة", s.byCompany), widths: [36, 12, 16] },
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
  const html = emailShell(`كشف الاشتراكات لشهر ${month}`, `${para(`مرفق كشف الاشتراكات لشهر ${month} بصيغة Excel، مع التفصيل حسب المستفيد وحسب الشركة. المبالغ بالدرهم الإماراتي.`)}${rowsTable(summary.map(([k, v]) => [k, `AED ${v}`] as [string, string]))}<p style="margin:20px 0 0;font-size:13px;color:#5E564D">${s.lines.length} حركة</p><p style="margin:14px 0 0">${button(url, "عرض الكشف في البوابة")}</p>`, { lang: "ar" });
  const text = `Sankari Holding — Subscriptions statement ${month}\n\n${summary.map(([k, v]) => `${k}: AED ${v}`).join("\n")}\n\n${s.lines.length} lines. The Excel file is attached.\nView in the portal: ${url}`;
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
  return transaction(async c => {
    const m = (await c.query<{ id: string; sent_at: string | null; email_outbox_id: string | null }>(`SELECT id,sent_at,email_outbox_id FROM monthly_statements WHERE month=$1::date FOR UPDATE`, [firstDay(month)])).rows[0];
    if (!m?.email_outbox_id) throw new AppError("Generate the statement first", 409);
    if (m.sent_at) throw new AppError("Already sent", 409);
    const r = await c.query(`UPDATE email_outbox SET state='pending',next_attempt_at=now() WHERE id=$1 AND state='held'`, [m.email_outbox_id]);
    if (!r.rowCount) throw new AppError("The statement email is not waiting to be sent", 409);
    await c.query(`UPDATE monthly_statements SET sent_at=now(),sent_by_user_id=$2 WHERE id=$1`, [m.id, userId]);
    await c.query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'statement.sent',$2,$3)`, [userId, JSON.stringify({ month }), ipHash]);
    return { month, sent: true };
  });
}

export const creditSchema = z.object({ occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(["payment", "refund"]), amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount: up to 2 decimals"), description: z.string().trim().max(300).default("") });
export async function addCredit(input: z.infer<typeof creditSchema>, userId: string, ipHash: string) {
  const [w, f = ""] = input.amount.split("."), cents = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  if (cents <= 0n) throw new AppError("Amount must be more than zero");
  const r = (await query<{ id: string }>(`INSERT INTO statement_credits(occurred_on,kind,amount_aed_cents,description,created_by_user_id) VALUES($1,$2,$3,$4,$5) RETURNING id`, [input.occurredOn, input.kind, cents.toString(), input.description, userId])).rows[0];
  await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'statement.credit_added',$2,$3)`, [userId, JSON.stringify({ id: r.id, ...input, amountAedCents: cents.toString() }), ipHash]);
  return r;
}

// Worker: on the 1st of the month from 06:00 Istanbul time, prepare last month's statement (held).
// Which month is due at this moment: last month, once it is 06:00 on the 1st in Istanbul (or any later day).
export function statementMonthDue(now: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map(x => [x.type, x.value]));
  return p.day === "01" && Number(p.hour) < 6 ? null : prevMonth(`${p.year}-${p.month}`);
}
export async function runMonthlyStatement(now = new Date()) {
  const month = statementMonthDue(now);
  if (!month) return null;
  const acc = await getAccounting();
  if (!acc.recipientEmail || month < acc.openingMonth) return null;
  if ((await query(`SELECT 1 FROM monthly_statements WHERE month=$1::date`, [firstDay(month)])).rowCount) return null;
  return generateStatement(month, null);
}
