import { query } from "./db";
import type { RequestRecord } from "./types";

const esc=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export async function queueMail(event:string,request:RequestRecord,recipient:string,title:string,body:string){
  if(!recipient)return;
  const url=new URL(`/requests/${request.id}`,process.env.NEXTAUTH_URL||"http://localhost:3000").href;
  const subject=`[Sankari] ${title}: ${request.subject}`;
  const text=`Sankari Holding\n${title}\n\n${body}\n\n${request.subject}\n${request.company} · ${request.priority}\n\nOpen request: ${url}`;
  const html=`<!doctype html><html><body style="margin:0;background:#f5f1eb;font-family:Arial,sans-serif;color:#302b26"><main style="max-width:620px;margin:24px auto;background:#fff"><header style="padding:28px;background:#b6602f;color:#fff"><strong>SANKARI HOLDING</strong><h1>${esc(title)}</h1></header><section style="padding:28px"><p>${esc(body)}</p><div style="padding:18px;background:#f5f1eb;border-radius:8px"><strong>${esc(request.subject)}</strong><p>${esc(request.company)} · ${esc(request.priority)}</p></div><p style="margin-top:28px"><a href="${esc(url)}" style="background:#b6602f;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Open request</a></p></section></main></body></html>`;
  await query(`INSERT INTO email_outbox(event_key,request_id,recipient,subject,html,text_body) VALUES($1,$2,lower($3),$4,$5,$6) ON CONFLICT(event_key) DO NOTHING`,[`${event}:${request.id}:${recipient.toLowerCase()}`,request.id,recipient,subject,html,text]);
}
