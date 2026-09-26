import { query } from "./db";
import { PRIORITY_LABEL, button, emailShell, esc, para, rowsTable } from "./email-layout";
import { refFor } from "./format";
import type { RequestRecord } from "./types";

export async function queueMail(event:string,request:RequestRecord,recipient:string,title:string,body:string){
  // Requests imported from ClickUp without a requester carry a placeholder address; nobody reads it.
  if(!recipient||/^legacy-clickup\+/i.test(recipient))return;
  const url=new URL(`/requests/${request.id}`,process.env.NEXTAUTH_URL||"http://localhost:3000").href;
  const ref=refFor(request.type,request.id,String(request.created_at)),prio=PRIORITY_LABEL[request.priority]??request.priority;
  const subject=`[Sankari] ${title}: ${request.subject}`;
  const text=`Sankari Holding\n${title}\n\n${body}\n\n${request.subject}\n${ref} · ${request.company} · ${prio}\n\nOpen request: ${url}`;
  const html=emailShell(title,`${para(body)}<div style="padding:16px 18px;background:#F7F5F1;border-radius:8px;margin:14px 0"><strong style="display:block;font-size:15px">${esc(request.subject)}</strong><span style="font-size:13px;color:#5E564D">${esc(ref)} · ${esc(request.company)} · ${esc(prio)}</span></div><p style="margin:18px 0 0">${button(url,"Open request")}</p>`);
  await query(`INSERT INTO email_outbox(event_key,request_id,recipient,subject,html,text_body) VALUES($1,$2,lower($3),$4,$5,$6) ON CONFLICT(event_key) DO NOTHING`,[`${event}:${request.id}:${recipient.toLowerCase()}`,request.id,recipient,subject,html,text]);
}

// The new-ticket email to an agent or admin: the whole ticket, plus one-time Start and Reject links.
// The buttons only open a confirm page in the portal; nothing changes until that page is submitted.
export async function queueTicketAlert(request:RequestRecord,recipient:string,ref:string,links:{start:string;reject:string}){
  const d=(request.details||{}) as Record<string,unknown>,category=String(d.category??""),asset=String(d.assetTag??"")||"—",prio=PRIORITY_LABEL[request.priority]??request.priority;
  const url=new URL(`/requests/${request.id}`,process.env.NEXTAUTH_URL||"http://localhost:3000").href;
  const subject=`[Sankari] New ticket ${ref} · ${prio}: ${request.subject}`;
  const rows:[string,string][]=[["Reference",ref],["From",`${request.requester_name} <${request.requester_email}>`],["Company",request.company],["Category",category],["Priority",prio],["Asset tag",asset]];
  const text=`Sankari Holding\nNew helpdesk ticket\n\n${rows.map(([k,v])=>`${k}: ${v}`).join("\n")}\n\n${request.subject}\n${request.description}\n\nStart (assign to me, set In progress): ${links.start}\nReject (reason required): ${links.reject}\n\nEach link works once, only for you, for 72 hours, and asks you to confirm in the portal.\nOpen ticket: ${url}`;
  const html=emailShell("New helpdesk ticket",`${rowsTable(rows)}<h2 style="font-size:17px;margin:20px 0 8px">${esc(request.subject)}</h2><p style="white-space:pre-wrap;line-height:1.5;margin:0">${esc(request.description)}</p><p style="margin:26px 0 8px">${button(links.start,"Start")} &nbsp; ${button(links.reject,"Reject","outline-bad")}</p><p style="font-size:12px;color:#5E564D;margin:0">Each button works once, only for you, for 72 hours, and asks you to confirm in the portal before anything changes. <a href="${esc(url)}" style="color:#B84F27">Open the ticket</a></p>`);
  await query(`INSERT INTO email_outbox(event_key,request_id,recipient,subject,html,text_body) VALUES($1,$2,lower($3),$4,$5,$6) ON CONFLICT(event_key) DO NOTHING`,[`submitted-team:${request.id}:${recipient.toLowerCase()}`,request.id,recipient,subject,html,text]);
}
