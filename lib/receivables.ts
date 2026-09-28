import { z } from "zod";
import { query } from "./db";
import { AppError } from "./errors";
import { emailShell, para, rowsTable } from "./email-layout";
import { getTerms } from "./contracts";
import { getAccounting } from "./statements";
import { buildXlsx, type Cell } from "./xlsx";
import type { User } from "./types";

// Outstanding receivables: every issued, unpaid contract invoice, by company. Finance exports it
// (Excel) or emails it to the accounting address; when the money arrives the accountant marks the
// invoice paid, which writes the inflow to the ledger (contracts.markInvoicePaid).

export type Receivable = { id: string; reference: string; installment: string; share_bps: number; amount_cents: string; currency: string; status: string; sent_on: string; due_on: string; days_open: number; days_late: number; company_name: string; contact_email: string; contract_ref: string; contract_id: string };
const canUse = (u: User) => u.roles.includes("admin") || u.roles.includes("accountant");

export async function listReceivables(company?: string) {
  const days = (await getTerms()).paymentTermsDays;
  return (await query<Receivable>(`SELECT i.id,i.reference,i.installment::text,i.share_bps,i.amount_cents::text,i.currency,i.status::text,to_char(i.sent_at,'YYYY-MM-DD') sent_on,
      to_char(i.sent_at::date+$1::int,'YYYY-MM-DD') due_on,greatest(0,current_date-i.sent_at::date)::int days_open,greatest(0,current_date-(i.sent_at::date+$1::int))::int days_late,
      c.company_name,c.contact_email,c.reference contract_ref,c.id contract_id
    FROM invoices i JOIN contracts c ON c.id=i.contract_id
    WHERE i.status IN ('sent','overdue') AND c.sample IS NOT TRUE AND ($2::text IS NULL OR c.company_name=$2)
    ORDER BY c.company_name,i.sent_at`, [days, company || null])).rows;
}

// Grouped for the screen and the file: each company with its invoices and its total per currency.
export function byCompany(rows: Receivable[]) {
  const m = new Map<string, { company: string; rows: Receivable[]; totals: Record<string, bigint> }>();
  for (const r of rows) { const g = m.get(r.company_name) ?? { company: r.company_name, rows: [], totals: {} }; g.rows.push(r); g.totals[r.currency] = (g.totals[r.currency] ?? 0n) + BigInt(r.amount_cents); m.set(r.company_name, g); }
  return [...m.values()];
}

const INST: Record<string, string> = { signing: "دفعة التوقيع", midpoint: "دفعة منتصف المدة", final: "الدفعة الختامية" };
const num = (c: string | bigint) => Number(BigInt(c)) / 100;
export function receivablesXlsx(rows: Receivable[]) {
  const head: Cell[] = ["الشركة", "الفاتورة", "العقد", "الدفعة", "تاريخ الإصدار", "تاريخ الاستحقاق", "أيام منذ الإصدار", "أيام التأخير", "المبلغ", "العملة", "بريد العميل"];
  const lines: Cell[][] = [head];
  for (const g of byCompany(rows)) {
    for (const r of g.rows) lines.push([r.company_name, r.reference, r.contract_ref, `${INST[r.installment] ?? r.installment} (${r.share_bps / 100}%)`, r.sent_on, r.due_on, r.days_open, r.days_late, num(r.amount_cents), r.currency, r.contact_email]);
    for (const [cur, v] of Object.entries(g.totals)) lines.push([`إجمالي ${g.company}`, "", "", "", "", "", null, null, num(v), cur, ""]);
  }
  const summary: Cell[][] = [["الشركة", "عدد الفواتير", "المستحق", "العملة", "أقدم فاتورة (أيام)"],
    ...byCompany(rows).flatMap(g => Object.entries(g.totals).map(([cur, v]) => [g.company, g.rows.filter(r => r.currency === cur).length, num(v), cur, Math.max(...g.rows.map(r => r.days_open))] as Cell[]))];
  return buildXlsx([
    { name: "الذمم المدينة", rtl: true, rows: lines, widths: [28, 18, 16, 24, 14, 14, 12, 12, 14, 8, 30] },
    { name: "حسب الشركة", rtl: true, rows: summary, widths: [30, 12, 16, 8, 16] },
  ]);
}
export const receivablesFilename = (company?: string) => `sankari-receivables${company ? `-${company.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40)}` : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`;

// Email the list (one company, or all) to the accounting address, with the Excel file attached.
export const receivablesEmailSchema = z.object({ company: z.string().trim().max(160).optional() });
export async function emailReceivables(company: string | undefined, user: User, ipHash: string) {
  if (!canUse(user)) throw new AppError("Only admins and accountants send receivables", 403);
  const to = (await getAccounting()).recipientEmail;
  if (!to) throw new AppError("Set the accounting email address first (Monthly statement → Settings)", 409);
  const rows = await listReceivables(company);
  if (!rows.length) throw new AppError("There are no outstanding invoices to send", 409);
  const groups = byCompany(rows), filename = receivablesFilename(company);
  const total = (g: typeof groups[number]) => Object.entries(g.totals).map(([cur, v]) => `${cur} ${num(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`).join(" + ");
  const title = company ? `الذمم المدينة — ${company}` : "الذمم المدينة لجميع الشركات";
  const html = emailShell(title, `${para(`مرفق كشف الفواتير الصادرة غير المسددة${company ? ` لشركة ${company}` : " حسب الشركة"} بصيغة Excel. عند وصول المبلغ إلى حسابنا يرجى تسجيل الفاتورة كمسددة في البوابة (المحاسبة → الذمم المدينة).`)}${rowsTable(groups.map(g => [`${g.company} (${g.rows.length})`, total(g)] as [string, string]), true)}`, { lang: "ar" });
  const text = `${title}\n\n${groups.map(g => `${g.company} (${g.rows.length}): ${total(g)}`).join("\n")}\n\nThe Excel file is attached. Mark each invoice paid in the portal when the money arrives.`;
  const att = JSON.stringify([{ filename, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: receivablesXlsx(rows).toString("base64") }]);
  await query(`INSERT INTO email_outbox(event_key,recipient,subject,html,text_body,attachments) VALUES($1,lower($2),$3,$4,$5,$6)`, [`receivables:${company ?? "all"}:${Date.now()}`, to, `[Sankari] ${title} · Outstanding receivables`, html, text, att]);
  await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'ledger.receivables_sent',$2,$3)`, [user.id, JSON.stringify({ company: company ?? null, to, invoices: rows.map(r => r.reference) }), ipHash]);
  return { sent: rows.length, to };
}
