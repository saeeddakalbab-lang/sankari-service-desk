import { z } from "zod";
import { query, transaction } from "./db";
import { AppError } from "./errors";
import { emailShell, esc, para } from "./email-layout";
import { refFor } from "./format";
import { COMPLETED, DONE, WHO } from "./jira";
import { buildXlsx, type Cell } from "./xlsx";

// Scheduled reports, weekly and monthly:
//   it  — "IT Infrastructure Report": helpdesk tickets, email-account requests and subscriptions
//   dev — "Dev Weekly / Monthly Report": Jira progress by space and by person
// Each goes to the recipients an admin picks, from a sender they pick (that person's name on the
// portal's mailbox, replies to them; migration 021), with the full task list as an Excel file.
// Periods are local (Asia/Damascus): the week is the 7 days ending yesterday; the month is last month.

export type Kind = "it" | "dev";
export type Cadence = "weekly" | "monthly";
const TZ = "Asia/Damascus";
const reportSchema = z.object({
  weekly: z.boolean(), monthly: z.boolean(),
  recipients: z.array(z.string().trim().toLowerCase().email().max(254)).max(40),
  senderUserId: z.string().uuid().nullable(),
});
export const reportSettingsSchema = z.object({ it: reportSchema, dev: reportSchema, weekday: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) });
export type ReportSettings = z.infer<typeof reportSettingsSchema>;
const EMPTY = { weekly: false, monthly: false, recipients: [], senderUserId: null };
export const DEFAULT_REPORTS: ReportSettings = { it: EMPTY, dev: EMPTY, weekday: 0, hour: 8 };

export async function getReportSettings(): Promise<ReportSettings> {
  const v = (await query<{ value: unknown }>(`SELECT value FROM settings WHERE key='reports'`)).rows[0]?.value;
  const p = reportSettingsSchema.safeParse(v);
  return p.success ? p.data : DEFAULT_REPORTS;
}
export async function saveReportSettings(input: ReportSettings, userId: string, ipHash: string) {
  for (const k of ["it", "dev"] as const) {
    const id = input[k].senderUserId;
    if (id && !(await query(`SELECT 1 FROM users WHERE id=$1 AND disabled_at IS NULL`, [id])).rowCount) throw new AppError("The chosen sender is not an active person", 404);
    input[k].recipients = [...new Set(input[k].recipients)];
  }
  await transaction(async c => {
    const before = (await c.query(`SELECT value FROM settings WHERE key='reports' FOR UPDATE`)).rows[0]?.value ?? null;
    await c.query(`INSERT INTO settings(key,value,updated_by) VALUES('reports',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by`, [JSON.stringify(input), userId]);
    await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'settings.reports',$2,$3,$4)`, [userId, JSON.stringify(before), JSON.stringify(input), ipHash]);
  });
  return getReportSettings();
}

// ---------- Periods ----------
const local = (d: Date) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), day: Number(p.day) }; };
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export type Period = { cadence: Cadence; from: string; to: string; label: string };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (s: string) => `${Number(s.slice(8, 10))} ${MON[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
export function periodFor(cadence: Cadence, now = new Date()): Period {
  const today = local(now).date;
  if (cadence === "weekly") { const from = addDays(today, -7), last = addDays(today, -1); return { cadence, from, to: today, label: `${nice(from)} – ${nice(last)}` }; }
  const [y, m] = today.split("-").map(Number), from = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`, to = `${today.slice(0, 7)}-01`;
  return { cadence, from, to, label: `${MON[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}` };
}
// "local midnight of $n" as a timestamptz, for comparing with the request timestamps.
const at = (n: number) => `($${n}::date::timestamp AT TIME ZONE '${TZ}')`;

// ---------- IT Infrastructure ----------
const TYPE: Record<string, string> = { helpdesk_ticket: "Helpdesk", email_account_request: "Email accounts", subscription_approval: "Subscriptions" };
const DONE_AT = "coalesce(resolved_at,closed_at)", OPEN = "resolved_at IS NULL AND closed_at IS NULL AND status NOT IN ('rejected','cancelled')";
export async function itReportData(p: Period) {
  const args = [p.from, p.to], f = at(1), t = at(2);
  const byType = (await query<{ type: string; opened: number; completed: number; open_now: number; overdue: number; sla_met: number; sla_missed: number; rejected: number; avg_hours: string | null }>(`
    SELECT type::text,
      count(*) FILTER (WHERE created_at>=${f} AND created_at<${t})::int opened,
      count(*) FILTER (WHERE ${DONE_AT}>=${f} AND ${DONE_AT}<${t})::int completed,
      count(*) FILTER (WHERE ${OPEN} AND created_at<${t})::int open_now,
      count(*) FILTER (WHERE ${OPEN} AND created_at<${t} AND sla_due_at<${t})::int overdue,
      count(*) FILTER (WHERE resolved_at>=${f} AND resolved_at<${t} AND resolved_at<=sla_due_at)::int sla_met,
      count(*) FILTER (WHERE resolved_at>=${f} AND resolved_at<${t} AND resolved_at>sla_due_at)::int sla_missed,
      count(*) FILTER (WHERE created_at>=${f} AND created_at<${t} AND status='rejected')::int rejected,
      round((avg(extract(epoch FROM resolved_at-created_at)/3600) FILTER (WHERE resolved_at>=${f} AND resolved_at<${t}))::numeric,1)::text avg_hours
    FROM requests GROUP BY 1`, args)).rows;
  const byCompany = (await query<{ name: string; n: number }>(`SELECT company name,count(*)::int n FROM requests WHERE created_at>=${f} AND created_at<${t} GROUP BY 1 ORDER BY 2 DESC,1`, args)).rows;
  const byPriority = (await query<{ name: string; n: number }>(`SELECT priority::text name,count(*)::int n FROM requests WHERE type='helpdesk_ticket' AND created_at>=${f} AND created_at<${t} GROUP BY 1 ORDER BY array_position(ARRAY['urgent','high','medium','low'],priority::text)`, args)).rows;
  const byAgent = (await query<{ name: string; n: number }>(`SELECT coalesce(u.name,'Unassigned') name,count(*)::int n FROM requests r LEFT JOIN users u ON u.id=r.assignee_id WHERE r.type<>'subscription_approval' AND coalesce(r.resolved_at,r.closed_at)>=${f} AND coalesce(r.resolved_at,r.closed_at)<${t} GROUP BY 1 ORDER BY 2 DESC,1`, args)).rows;
  const tasks = (await query<{ id: string; type: string; subject: string; requester_name: string; company: string; department: string; priority: string; status: string; assignee: string | null; created_at: string; done_at: string | null; sla_due_at: string }>(`
    SELECT r.id,r.type::text,r.subject,r.requester_name,r.company,r.department,r.priority::text,r.status,u.name assignee,r.created_at,coalesce(r.resolved_at,r.closed_at) done_at,r.sla_due_at
      FROM requests r LEFT JOIN users u ON u.id=r.assignee_id
     WHERE (r.created_at>=${f} AND r.created_at<${t}) OR (coalesce(r.resolved_at,r.closed_at)>=${f} AND coalesce(r.resolved_at,r.closed_at)<${t})
     ORDER BY r.created_at LIMIT 5000`, args)).rows;
  const bills = (await query<{ billed_on: string; tool: string; company_name: string; amount_cents: string; currency: string; amount_aed_cents: string; kind: string }>(`
    SELECT to_char(billed_on,'YYYY-MM-DD') billed_on,tool,company_name,amount_cents::text,currency,amount_aed_cents::text,kind FROM subscription_bills WHERE billed_on>=$1::date AND billed_on<$2::date ORDER BY billed_on`, args)).rows;
  const renewalsAhead = (await query<{ n: number }>(`SELECT count(*)::int n FROM subscriptions WHERE status IN ('active','renewal_due') AND cancel_at IS NULL AND renewal_date>=$1::date AND renewal_date<$1::date+30`, [p.to])).rows[0].n;
  return { byType, byCompany, byPriority, byAgent, tasks, bills, renewalsAhead };
}

// ---------- Dev (Jira) ----------
export async function devReportData(p: Period) {
  const args = [p.from, p.to], f = at(1), t = at(2);
  const names = (await query<{ value: Record<string, string> }>(`SELECT value FROM system_state WHERE key='jira_projects'`)).rows[0]?.value ?? {};
  const spaces = (await query<{ key: string; total: number; done: number; done_in: number; open: number; overdue: number }>(`
    SELECT project_key key,count(*)::int total,count(*) FILTER (WHERE ${DONE})::int done,
      count(*) FILTER (WHERE ${DONE} AND ${COMPLETED}>=${f} AND ${COMPLETED}<${t})::int done_in,
      count(*) FILTER (WHERE NOT (${DONE}))::int open,count(*) FILTER (WHERE NOT (${DONE}) AND due_date<$2::date)::int overdue
    FROM jira_issues GROUP BY 1 ORDER BY 2 DESC`, args)).rows.map(s => ({ ...s, name: names[s.key] || s.key }));
  const team = (await query<{ name: string; done_in: number; open: number; spaces: string[] }>(`
    SELECT coalesce(max(assignee_name),max(assignee_email),'') name,count(*) FILTER (WHERE ${DONE} AND ${COMPLETED}>=${f} AND ${COMPLETED}<${t})::int done_in,
      count(*) FILTER (WHERE NOT (${DONE}))::int open,array_agg(DISTINCT project_key) spaces
    FROM jira_issues WHERE ${WHO} IS NOT NULL GROUP BY ${WHO} ORDER BY 2 DESC,3 DESC`, args)).rows;
  const completed = (await query<{ issue_key: string; project_key: string; summary: string; assignee_name: string | null; completed: string }>(`
    SELECT issue_key,project_key,summary,assignee_name,to_char(${COMPLETED} AT TIME ZONE '${TZ}','YYYY-MM-DD') completed FROM jira_issues
     WHERE ${DONE} AND ${COMPLETED}>=${f} AND ${COMPLETED}<${t} ORDER BY ${COMPLETED} LIMIT 5000`, args)).rows;
  const overdue = (await query<{ issue_key: string; project_key: string; summary: string; assignee_name: string | null; due: string; status: string }>(`
    SELECT issue_key,project_key,summary,assignee_name,to_char(due_date,'YYYY-MM-DD') due,status FROM jira_issues WHERE NOT (${DONE}) AND due_date<$1::date ORDER BY due_date LIMIT 2000`, [p.to])).rows;
  return { spaces, team, completed, overdue };
}

// ---------- Email and Excel ----------
export const reportTitle = (kind: Kind, c: Cadence) => kind === "it" ? `IT Infrastructure Report — ${c === "weekly" ? "Weekly" : "Monthly"}` : `Dev ${c === "weekly" ? "Weekly" : "Monthly"} Report`;
const titleAr = (kind: Kind, c: Cadence) => kind === "it" ? `تقرير البنية التحتية لتقنية المعلومات — ${c === "weekly" ? "أسبوعي" : "شهري"}` : `تقرير فريق التطوير — ${c === "weekly" ? "أسبوعي" : "شهري"}`;
const F = "Arial,Tahoma,Helvetica,sans-serif";
const tiles = (items: [string, string, string?][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0 8px;margin:4px 0 8px">`
  + [0, 1].map(r => items.slice(r * 4, r * 4 + 4)).filter(x => x.length).map(row => `<tr>${row.map(([label, value, sub]) => `<td width="25%" valign="top" bgcolor="#F7F5F1" style="width:25%;background:#F7F5F1;border-radius:8px;padding:12px 12px;font-family:${F}"><div style="font-size:12px;color:#5E564D">${esc(label)}</div><div style="font-size:24px;line-height:30px;font-weight:bold;color:#2B2622">${esc(value)}</div>${sub ? `<div style="font-size:12px;color:#5E564D">${esc(sub)}</div>` : ""}</td>`).join(`<td width="8" style="width:8px">&nbsp;</td>`)}</tr>`).join("") + `</table>`;
const dataTable = (head: string[], rows: (string | number)[][]) => rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-family:${F};font-size:13px;margin:6px 0 16px">`
  + `<tr>${head.map((h, i) => `<th align="${i ? "right" : "left"}" bgcolor="#4A443C" style="background:#4A443C;color:#FFFFFF;padding:7px 9px;text-align:${i ? "right" : "left"};font-weight:bold">${esc(h)}</th>`).join("")}</tr>`
  + rows.map((r, j) => `<tr>${r.map((c, i) => `<td align="${i ? "right" : "left"}" ${j % 2 ? 'bgcolor="#F7F5F1"' : ""} style="padding:7px 9px;border-bottom:1px solid #EFEBE5;color:#2B2622;text-align:${i ? "right" : "left"}${j % 2 ? ";background:#F7F5F1" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("") + `</table>` : `<p style="font-family:${F};font-size:13px;color:#5E564D;margin:4px 0 14px">None in this period.</p>`;
const h2 = (t: string) => `<h2 style="font-family:${F};font-size:16px;color:#B84F27;margin:18px 0 4px">${esc(t)}</h2>`;
const aed = (c: bigint) => `AED ${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (a: number, b: number) => b ? `${Math.round(a * 100 / b)}%` : "—";
const localDate = (d: string | null) => d ? local(new Date(d)).date : "";

export async function buildReport(kind: Kind, p: Period) {
  const title = reportTitle(kind, p.cadence), subtitle = `${p.label}`;
  let inner = "", sheets: { name: string; rows: Cell[][]; widths?: number[] }[] = [], text = "";
  if (kind === "it") {
    const d = await itReportData(p), g = (t: string) => d.byType.find(x => x.type === t) ?? { opened: 0, completed: 0, open_now: 0, overdue: 0, sla_met: 0, sla_missed: 0, rejected: 0, avg_hours: null };
    const hd = g("helpdesk_ticket"), em = g("email_account_request"), sb = g("subscription_approval");
    const billsAed = d.bills.reduce((s, b) => s + BigInt(b.amount_aed_cents), 0n);
    inner = para(`Summary of the IT department's work for ${p.label}: helpdesk tickets, email-account requests and subscriptions. The full task list is attached as Excel.`)
      + h2("Helpdesk") + tiles([["Opened", String(hd.opened)], ["Resolved", String(hd.completed)], ["Still open", String(hd.open_now), `${hd.overdue} past SLA`], ["SLA met", pct(hd.sla_met, hd.sla_met + hd.sla_missed), `${hd.sla_met} met · ${hd.sla_missed} missed`],
        ["Avg time to resolve", hd.avg_hours ? `${hd.avg_hours} h` : "—"], ["Rejected", String(hd.rejected)]])
      + h2("Email accounts") + tiles([["Requested", String(em.opened)], ["Completed", String(em.completed)], ["Still open", String(em.open_now)], ["Rejected", String(em.rejected)]])
      + h2("Subscriptions") + tiles([["Requested", String(sb.opened)], ["Waiting approval", String(sb.open_now)], ["Charges", String(d.bills.length), aed(billsAed)], ["Renewals in the next 30 days", String(d.renewalsAhead)]])
      + h2("Helpdesk by priority") + dataTable(["Priority", "Opened"], d.byPriority.map(x => [x.name[0].toUpperCase() + x.name.slice(1), x.n]))
      + h2("Requests by company") + dataTable(["Company", "Opened"], d.byCompany.map(x => [x.name, x.n]))
      + h2("Completed by") + dataTable(["Person", "Completed"], d.byAgent.map(x => [x.name, x.n]));
    text = `${title} · ${p.label}\n\nHelpdesk: ${hd.opened} opened, ${hd.completed} resolved, ${hd.open_now} still open (${hd.overdue} past SLA), SLA met ${pct(hd.sla_met, hd.sla_met + hd.sla_missed)}.\nEmail accounts: ${em.opened} requested, ${em.completed} completed.\nSubscriptions: ${sb.opened} requested, ${d.bills.length} charges (${aed(billsAed)}), ${d.renewalsAhead} renewals in the next 30 days.\n\nThe full task list is attached.`;
    sheets = [
      { name: "Summary", rows: [["", "Opened", "Completed", "Still open", "Past SLA", "SLA met", "SLA missed", "Rejected", "Avg hours to resolve"], ...(["helpdesk_ticket", "email_account_request", "subscription_approval"] as const).map(tp => { const x = g(tp); return [TYPE[tp], x.opened, x.completed, x.open_now, x.overdue, x.sla_met, x.sla_missed, x.rejected, x.avg_hours ? Number(x.avg_hours) : null] as Cell[]; })], widths: [18, 10, 11, 11, 10, 10, 11, 10, 18] },
      { name: "Tasks", rows: [["Reference", "Type", "Subject", "Requester", "Company", "Department", "Priority", "Status", "Assigned to", "Created", "Completed", "SLA"], ...d.tasks.map(r => [refFor(r.type, r.id, r.created_at), TYPE[r.type] ?? r.type, r.subject, r.requester_name, r.company, r.department, r.priority, r.status.replace(/_/g, " "), r.assignee ?? "", localDate(r.created_at), localDate(r.done_at), r.done_at ? (new Date(r.done_at) <= new Date(r.sla_due_at) ? "Met" : "Missed") : (new Date(r.sla_due_at) < new Date() ? "Overdue" : "")] as Cell[])], widths: [16, 14, 40, 22, 18, 22, 10, 14, 20, 12, 12, 9] },
      { name: "Subscription charges", rows: [["Date", "Tool", "Company", "Amount", "Currency", "AED", "Kind"], ...d.bills.map(b => [b.billed_on, b.tool, b.company_name, Number(b.amount_cents) / 100, b.currency, Number(b.amount_aed_cents) / 100, b.kind] as Cell[])], widths: [12, 28, 20, 12, 9, 12, 10] },
    ];
  } else {
    const d = await devReportData(p), doneIn = d.spaces.reduce((s, x) => s + x.done_in, 0), open = d.spaces.reduce((s, x) => s + x.open, 0), total = d.spaces.reduce((s, x) => s + x.total, 0), done = d.spaces.reduce((s, x) => s + x.done, 0), best = d.team.find(x => x.done_in > 0);
    inner = para(`Progress of the development team in Jira for ${p.label}, by space and by person. The completed and overdue issues are attached as Excel.`)
      + tiles([["Completed in the period", String(doneIn)], ["Open now", String(open)], ["Overall complete", pct(done, total)], ["Top of the period", best ? best.name : "—", best ? `${best.done_in} completed` : ""]])
      + h2("By space") + dataTable(["Space", "Completed in period", "Open", "Overdue", "Complete"], d.spaces.map(s => [s.name, s.done_in, s.open, s.overdue, pct(s.done, s.total)]))
      + h2("By person") + dataTable(["Person", "Completed in period", "Open"], d.team.filter(x => x.done_in || x.open).slice(0, 15).map(x => [x.name || "—", x.done_in, x.open]));
    text = `${title} · ${p.label}\n\n${doneIn} issues completed, ${open} open, ${pct(done, total)} complete overall.${best ? ` Top: ${best.name} (${best.done_in}).` : ""}\n\n${d.spaces.map(s => `${s.name}: ${s.done_in} completed, ${s.open} open`).join("\n")}\n\nThe completed and overdue issues are attached.`;
    sheets = [
      { name: "Spaces", rows: [["Space", "Key", "Total", "Done", "Completed in period", "Open", "Overdue", "Complete %"], ...d.spaces.map(s => [s.name, s.key, s.total, s.done, s.done_in, s.open, s.overdue, s.total ? Math.round(s.done * 100 / s.total) : 0] as Cell[])], widths: [28, 8, 8, 8, 18, 8, 9, 11] },
      { name: "Team", rows: [["Person", "Completed in period", "Open", "Spaces"], ...d.team.map(x => [x.name, x.done_in, x.open, x.spaces.join(", ")] as Cell[])], widths: [26, 18, 8, 30] },
      { name: "Completed", rows: [["Key", "Space", "Summary", "Assignee", "Completed"], ...d.completed.map(i => [i.issue_key, i.project_key, i.summary, i.assignee_name ?? "", i.completed] as Cell[])], widths: [12, 8, 60, 22, 12] },
      { name: "Overdue", rows: [["Key", "Space", "Summary", "Assignee", "Due", "Status"], ...d.overdue.map(i => [i.issue_key, i.project_key, i.summary, i.assignee_name ?? "", i.due, i.status] as Cell[])], widths: [12, 8, 60, 22, 12, 14] },
    ];
  }
  const html = emailShell(`${title} · ${subtitle}`, `<p dir="rtl" lang="ar" style="margin:0 0 14px;font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#5E564D;text-align:right">${esc(titleAr(kind, p.cadence))} · ${esc(p.label)}</p>${inner}`);
  const filename = `${kind === "it" ? "it-infrastructure" : "dev"}-report-${p.cadence}-${p.from}.xlsx`;
  return { title, subject: `[Sankari] ${title} · ${p.label}`, html, text, filename, file: buildXlsx(sheets) };
}

// ---------- Sending ----------
async function senderFor(id: string | null) {
  if (!id) return null;
  return (await query<{ name: string; email: string }>(`SELECT name,email FROM users WHERE id=$1 AND disabled_at IS NULL`, [id])).rows[0] ?? null;
}
export async function queueReport(kind: Kind, cadence: Cadence, opts: { byUserId: string | null; ipHash?: string; now?: Date; manual?: boolean }) {
  const s = await getReportSettings(), cfg = s[kind];
  if (!cfg.recipients.length) throw new AppError("Add at least one recipient first", 409);
  const p = periodFor(cadence, opts.now), r = await buildReport(kind, p), from = await senderFor(cfg.senderUserId);
  const att = JSON.stringify([{ filename: r.filename, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: r.file.toString("base64") }]);
  const stamp = opts.manual ? `:manual:${Date.now()}` : "";
  for (const to of cfg.recipients)
    await query(`INSERT INTO email_outbox(event_key,recipient,subject,html,text_body,attachments,from_name,reply_to) VALUES($1,lower($2),$3,$4,$5,$6,$7,$8) ON CONFLICT(event_key) DO NOTHING`,
      [`report:${kind}:${cadence}:${p.from}:${to}${stamp}`, to, r.subject, r.html, r.text, att, from ? from.name.replace(/[<>"\r\n]/g, "").slice(0, 120) : null, from?.email ?? null]);
  await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'report.sent',$2,$3)`, [opts.byUserId, JSON.stringify({ kind, cadence, from: p.from, to: p.to, recipients: cfg.recipients, sender: from?.email ?? null, manual: !!opts.manual }), opts.ipHash ?? ""]);
  return { kind, cadence, period: p.label, recipients: cfg.recipients.length };
}

// Worker: weekly on the chosen weekday, monthly on the 1st, from the chosen hour; once per period.
export async function runReports(now = new Date()) {
  const s = await getReportSettings(), l = local(now), out: string[] = [];
  if (l.hour < s.hour) return out;
  for (const kind of ["it", "dev"] as const) for (const cadence of ["weekly", "monthly"] as const) {
    const cfg = s[kind];
    if (!cfg[cadence] || !cfg.recipients.length) continue;
    if (cadence === "weekly" ? l.weekday !== s.weekday : l.day !== 1) continue;
    const p = periodFor(cadence, now), key = `report:${kind}:${cadence}:${p.from}`;
    // Claim the period first, so two workers (or a restart) never send it twice.
    const claimed = await query(`INSERT INTO system_state(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING`, [key, JSON.stringify({ at: now.toISOString() })]);
    if (!claimed.rowCount) continue;
    try { await queueReport(kind, cadence, { byUserId: null, now }); }
    catch (e) { await query(`DELETE FROM system_state WHERE key=$1`, [key]); throw e; }
    out.push(`${kind}:${cadence}:${p.from}`);
  }
  return out;
}
