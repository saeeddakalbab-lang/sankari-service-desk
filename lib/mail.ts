import { query } from "./db";
import { button, emailShell, esc, para, rowsTable } from "./email-layout";
import { fmtDateTime, refFor } from "./format";
import { translator, type I18nKey } from "./i18n";
import { labels, mailText, type Labels, type MailMsg } from "./mail-text";
import type { Locale, RequestRecord } from "./types";

// The recipient's own portal language; people without one (or not yet signed in) get English.
async function localeOf(email: string): Promise<Locale> {
  const r = await query<{ preferred_locale: string | null }>(`SELECT preferred_locale FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
  return r.rows[0]?.preferred_locale === "ar" ? "ar" : "en";
}
const openUrl = (id: string) => new URL(`/requests/${id}`, process.env.NEXTAUTH_URL || "http://localhost:3000").href;
const insert = (key: string, request: RequestRecord, recipient: string, m: { subject: string; html: string; text: string }) =>
  query(`INSERT INTO email_outbox(event_key,request_id,recipient,subject,html,text_body) VALUES($1,$2,lower($3),$4,$5,$6) ON CONFLICT(event_key) DO NOTHING`, [key, request.id, recipient, m.subject, m.html, m.text]);

// Everything the recipient needs without opening the portal: who, what, where it stands, by when.
function requestFacts(request: RequestRecord, locale: Locale, assignee: string | null) {
  const t = translator(locale), l = labels(locale), ref = refFor(request.type, request.id, String(request.created_at));
  const rows: [string, string][] = [
    [l.reference, ref],
    [l.type, t(`type.${request.type}` as I18nKey)],
    [l.requester, request.requester_name || request.requester_email],
    [l.company, request.company],
    [l.priority, t(`prio.${request.priority}` as I18nKey)],
    [l.status, t(`status.${request.status}` as I18nKey)],
    [l.assignee, assignee || l.unassigned],
  ];
  if (request.sla_due_at && !request.resolved_at) rows.push([l.due, fmtDateTime(request.sla_due_at)]);
  rows.push([l.submitted, fmtDateTime(request.created_at)]);
  return { ref, rows, t, l };
}

const card = (subject: string, description: string, l: Labels) =>
  `<div style="padding:16px 18px;background:#F7F5F1;border-radius:8px;margin:16px 0" dir="auto"><strong style="display:block;font-size:16px;margin-bottom:6px">${esc(subject)}</strong>`
  + (description.trim() ? `<span style="display:block;font-size:12px;color:#5E564D;margin-bottom:4px">${esc(l.description)}</span><div style="white-space:pre-wrap;line-height:1.55;font-size:14px;text-align:start" dir="auto">${esc(description.length > 1200 ? description.slice(0, 1200) + "…" : description)}</div>` : "")
  + `</div>`;
const quote = (label: string, text: string, rtl: boolean) =>
  `<div style="border-${rtl ? "right" : "left"}:3px solid #B84F27;padding:8px 14px;margin:14px 0;background:#FBF8F4"><span style="display:block;font-size:12px;color:#5E564D;margin-bottom:4px">${esc(label)}</span><div style="white-space:pre-wrap;line-height:1.55" dir="auto">${esc(text)}</div></div>`;

// Builds one request email. Pure, so tests and previews render it without a database.
export function buildRequestMail(request: RequestRecord, locale: Locale, msg: MailMsg, extra: { comment?: string; assignee?: string | null } = {}) {
  const rtl = locale === "ar", url = openUrl(request.id);
  const { ref, rows, t, l } = requestFacts(request, locale, extra.assignee ?? null);
  const p = { ...msg.p }; if (p.status) p.status = t(`status.${p.status}` as I18nKey);
  const { title, body } = mailText({ ...msg, p }, locale);
  const subject = `[Sankari] ${title}: ${request.subject}`;
  const text = [l.footer, title, "", body, extra.comment ? `\n${l.comment}:\n${extra.comment}` : "", "", request.subject, ...rows.map(([k, v]) => `${k}: ${v}`), "", request.description ? `${l.description}:\n${request.description}` : "", "", `${l.open}: ${url}`].join("\n").replace(/\n{3,}/g, "\n\n");
  const html = emailShell(title, `${para(body)}${extra.comment ? quote(l.comment, extra.comment, rtl) : ""}${card(request.subject, request.description || "", l)}${rowsTable(rows, rtl)}<p style="margin:22px 0 0">${button(url, l.open)}</p>`, { lang: locale, footer: l.footer });
  return { ref, subject, html, text };
}

export async function queueMail(event: string, request: RequestRecord, recipient: string, msg: MailMsg, extra: { comment?: string } = {}) {
  // Requests imported from ClickUp without a requester carry a placeholder address; nobody reads it.
  if (!recipient || /^legacy-clickup\+/i.test(recipient)) return;
  const assignee = request.assignee_id ? (await query<{ name: string }>(`SELECT name FROM users WHERE id=$1`, [request.assignee_id])).rows[0]?.name ?? null : null;
  await insert(`${event}:${request.id}:${recipient.toLowerCase()}`, request, recipient, buildRequestMail(request, await localeOf(recipient), msg, { ...extra, assignee }));
}

// The new-ticket email to an agent or admin: the whole ticket, plus one-time Start and Reject links.
// The buttons only open a confirm page in the portal; nothing changes until that page is submitted.
export function buildTicketAlert(request: RequestRecord, locale: Locale, ref: string, links: { start: string; reject: string }) {
  const rtl = locale === "ar", t = translator(locale), l = labels(locale);
  const d = (request.details || {}) as Record<string, unknown>, url = openUrl(request.id), prio = t(`prio.${request.priority}` as I18nKey);
  const { title } = mailText({ k: "newTicket" }, locale);
  const subject = `[Sankari] ${title} ${ref} · ${prio}: ${request.subject}`;
  const rows: [string, string][] = [[l.reference, ref], [l.requester, `${request.requester_name} <${request.requester_email}>`], [l.company, request.company], [l.category, String(d.category ?? "")], [l.priority, prio], [l.asset, String(d.assetTag ?? "") || "—"]];
  if (request.sla_due_at) rows.push([l.due, fmtDateTime(request.sla_due_at)]);
  const text = `${l.footer}\n${title}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${request.subject}\n${request.description}\n\n${l.start}: ${links.start}\n${l.reject}: ${links.reject}\n\n${l.links}\n${l.openTicket}: ${url}`;
  const html = emailShell(title, `${rowsTable(rows, rtl)}${card(request.subject, request.description || "", l)}<p style="margin:22px 0 8px">${button(links.start, l.start)} &nbsp; ${button(links.reject, l.reject, "outline-bad")}</p><p style="font-size:12px;color:#5E564D;margin:0">${esc(l.links)} <a href="${esc(url)}" style="color:#B84F27">${esc(l.openTicket)}</a></p>`, { lang: locale, footer: l.footer });
  return { subject, html, text };
}
export async function queueTicketAlert(request: RequestRecord, recipient: string, ref: string, links: { start: string; reject: string }) {
  await insert(`submitted-team:${request.id}:${recipient.toLowerCase()}`, request, recipient, buildTicketAlert(request, await localeOf(recipient), ref, links));
}
