import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import { isActive, nowIso } from './domain.js';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fallback=()=>process.env.IT_EMAIL||'saeed.dakalbab@sankari-holding.com';
export function mailTemplate(kind,r,title,body,baseUrl){
 const url=new URL('/'+kind,baseUrl);url.searchParams.set(kind==='helpdesk'?'ticket':'request',r.id);
 const label=kind==='helpdesk'?'Open ticket':'Open request';
 return {subject:`[Sankari ${kind==='helpdesk'?'IT':'Email'}] ${title}: ${r.subject}`,text:`Sankari Holding\n${title}\n\n${body}\n\nSubject: ${r.subject}\nRequester: ${r.requesterName}\nCompany: ${r.company}\nPriority: ${r.priority}\nStatus: ${r.status}\n\n${label}: ${url.href}`,html:`<!doctype html><html><body style="margin:0;background:#f5f1eb;font-family:Arial,sans-serif;color:#292622"><main style="max-width:600px;margin:24px auto;background:white"><header style="background:#b6602f;color:white;padding:28px"><strong>SANKARI HOLDING</strong><h1 style="font-size:24px">${esc(title)}</h1></header><section style="padding:28px"><p>${esc(body).replace(/\n/g,'<br>')}</p><div style="background:#f5f1eb;padding:20px;border-radius:8px"><strong>${esc(r.subject)}</strong><p>${esc(r.requesterName)} · ${esc(r.company)}</p><p>Priority: ${esc(r.priority)} · Status: ${esc(r.status)}</p></div><p style="margin-top:28px"><a href="${esc(url.href)}" style="background:#b6602f;color:white;padding:14px 22px;text-decoration:none;border-radius:6px">${label}</a></p></section></main></body></html>`};
}
export function queueNotifications(store,kind,baseUrl,now=Date.now()){
 const agents=store.agents(kind),requests=store.list(kind,{isAdmin:true});let count=0;
 const enqueue=(r,event,when,to,title,body)=>{if(!when||!to)return;const id=createHash('sha256').update([kind,r.id,event,when,to].join('|')).digest('hex');const m=mailTemplate(kind,r,title,body,baseUrl);const result=store.db.prepare('INSERT OR IGNORE INTO mail_jobs(id,kind,request_id,recipient,subject,html,text,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,kind,r.id,to,m.subject,m.html,m.text,nowIso());count+=Number(result.changes);};
 for(const r of requests){
  const assignee=agents.find(a=>a.id===r.assigneeId)?.email||fallback();
  enqueue(r,'new-it',r.createdAt,fallback(),'New request',`${r.requesterName} submitted a new request. Please review and assign it.`);
  enqueue(r,'new-requester',r.createdAt,r.requesterEmail,'Request received','We received your request. You can follow its progress and add comments using the link below.');
  for(const to of new Set([assignee,r.requesterEmail]))enqueue(r,'assigned',r.assignedAt,to,'Request assigned',`Your request is assigned to ${r.assigneeName}.`);
  if(kind==='helpdesk')enqueue(r,'resolved',r.resolvedAt,r.requesterEmail,'Request resolved','Your request has been resolved. Please review it; you can reopen it if you still need help.');
  if(kind==='email'){
    enqueue(r,'provisioned',r.accountCreatedAt,r.requesterEmail,'Account ready',`The requested account is ready: ${r.accountDetails?.email||''}. IT will contact the employee through WhatsApp. No password is included in this message.`);
    enqueue(r,'whatsapp-reminder',r.accountCreatedAt,assignee,'Send WhatsApp confirmation','The account has been provisioned. Please send the WhatsApp message and record it in the tracker.');
    enqueue(r,'whatsapp-sent',r.whatsappSentAt,r.requesterEmail,'Awaiting confirmation','IT recorded that the WhatsApp account message was sent. Please confirm receipt in the tracker.');
    for(const to of new Set([r.requesterEmail,assignee]))enqueue(r,'confirmed',r.confirmedAt,to,'Account confirmed','The account delivery has been confirmed.');
    enqueue(r,'closed',r.closedAt,r.requesterEmail,'Request closed','The account request has been completed and closed.');
  }
  enqueue(r,'reopened',r.reopenedAt,assignee,'Request reopened','This request has been reopened and needs your attention.');
  for(const c of store.comments(r.id))enqueue(r,'comment-'+c.id,c.createdAt,c.isAdmin?r.requesterEmail:assignee,'New comment',`${c.authorName}:\n${c.body}`);
  if(isActive(kind,r.status)){
    const remaining=Date.parse(r.slaDueAt)-now;
    if(remaining>0&&remaining<=2*3600000)enqueue(r,'sla-warning',r.slaDueAt,assignee,'SLA due soon','This request is due within two hours.');
    if(remaining<=0)enqueue(r,'sla-breach',r.slaDueAt,assignee,'SLA overdue','This request has passed its target resolution time.');
  }
 }
 return count;
}
export function createTransport(){if(!process.env.SMTP_HOST)return null;return nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}:{}),connectionTimeout:15000,socketTimeout:30000});}
export async function drainMail(store,transport){
 if(!transport)return {sent:0,pending:store.db.prepare("SELECT count(*) n FROM mail_jobs WHERE status='pending'").get().n};let sent=0;
 for(const j of store.db.prepare("SELECT * FROM mail_jobs WHERE status='pending' AND attempts<10 ORDER BY created_at LIMIT 50").all()){
  try{await transport.sendMail({from:process.env.MAIL_FROM||'Sankari IT <it@sankari-holding.com>',to:j.recipient,subject:j.subject,html:j.html,text:j.text,messageId:`<${j.id}@sankari-service-desk>`});store.db.prepare("UPDATE mail_jobs SET status='sent',sent_at=?,attempts=attempts+1,last_error=NULL WHERE id=?").run(nowIso(),j.id);sent++;}
  catch(e){store.db.prepare('UPDATE mail_jobs SET attempts=attempts+1,last_error=? WHERE id=?').run(String(e.message).slice(0,500),j.id);}
 }
 return {sent};
}
export function startScheduler(store,baseUrl){
 const transport=createTransport();let running=false,lastAlert=0;
 async function tick(){if(running)return;running=true;try{const d=new Date(),slot=d.toISOString().slice(0,13);for(const [kind,minute]of [['helpdesk',48],['email',27]]){
   const state=store.db.prepare('SELECT * FROM scheduler WHERE job=?').get(kind);
   // First boot runs once; subsequent runs catch up once after each scheduled minute.
   const due=d.getUTCMinutes()>=minute?slot:new Date(d.getTime()-3600000).toISOString().slice(0,13);
   if(!state||state.last_slot!==due){queueNotifications(store,kind,baseUrl);store.db.prepare('INSERT INTO scheduler(job,last_slot,last_run_at,last_error) VALUES(?,?,?,NULL) ON CONFLICT(job) DO UPDATE SET last_slot=excluded.last_slot,last_run_at=excluded.last_run_at,last_error=NULL').run(kind,due,nowIso());}
  }await drainMail(store,transport);
 }catch(e){console.error('Notifier failed:',e.message);if(transport&&Date.now()-lastAlert>3600000){lastAlert=Date.now();try{await transport.sendMail({from:process.env.MAIL_FROM||fallback(),to:fallback(),subject:'Sankari service desk: notifier unavailable',text:'The notification job could not access or process the database. Check the server logs.'});}catch{}}}finally{running=false;}}
 const timer=setInterval(tick,60000);timer.unref();tick();return ()=>{clearInterval(timer);transport?.close();};
}
