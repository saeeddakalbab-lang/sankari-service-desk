import { randomUUID } from 'node:crypto';
export const COMPANIES = ['Sankari Holding','Electro Taxi','Five Oceans','Arcaden','Al-Majd Foundation','Domainz','77Auto','Mall of Aleppo','East West','Electro Cafe'];
export const AGENTS = [
  ['saeed-dakalbab','Mohamed Saeed Dakalbab (IT)','saeed.dakalbab@sankari-holding.com'],
  ['sami-hijlawi','Sami Hijlawi','sami.hijlawi@sankari-holding.com'],
  ['samar-dihna','Samar Dihna','samar.dihna@sankari-holding.com'],
  ['ahmad-khudur','Ahmad Khudur','ahmad.khudur@sankari-holding.com'],
  ['mustafa-omar','Mustafa Omar','mustafa.omar@sankari-holding.com']
].map(([id,name,email],i)=>({id,name,email,isDefault:i===0}));
export const HOURS = { urgent:4, high:24, medium:72, low:120 };
export const CATEGORIES = ['hardware','software','network','access','email','printer','other'];
export const TYPES = ['new_account','modification','password_reset','domain_change','erp_access','cancellation','other'];
export const FLOWS = {
  helpdesk: {new:['assign'],reopened:['assign'],assigned:['assign','start'],inprogress:['assign','wait','resolve'],waiting:['resume','resolve'],resolved:['reopen','close'],closed:['reopen']},
  email: {new:['assign'],reopened:['assign'],assigned:['assign','start'],inprogress:['assign','wait','provision'],waiting:['assign','resume'],provisioned:['provision','whatsapp'],whatsapp_sent:['whatsapp','confirm'],confirmed:['close'],closed:['reopen']}
};
export const nowIso = ()=>new Date().toISOString();
export const uid = ()=>randomUUID();
export const isActive = (kind,status)=>kind==='email' ? ['new','assigned','inprogress','waiting','reopened'].includes(status) : !['resolved','closed'].includes(status);
export const overdue = (kind,r,now=Date.now())=>isActive(kind,r.status)&&Date.parse(r.slaDueAt)<now;
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function str(v,max=500,required=false){if(typeof v!=='string'){if(required)fail('Required field missing');return '';} const s=v.trim();if(required&&!s)fail('Required field missing');if(s.length>max)fail('Field is too long');return s;}
export function email(v,required=true){const s=str(v,254,required).toLowerCase();if(s&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail('Invalid email address');return s;}
export function fields(kind,b){
  const priority=b.priority??'medium'; if(!Object.hasOwn(HOURS,priority))fail('Invalid priority');
  if(!COMPANIES.includes(b.company))fail('Invalid company');
  const r={requesterName:str(b.requesterName,120,true),requesterEmail:email(b.requesterEmail),department:str(b.department,120,true),company:b.company,subject:str(b.subject,200,true),description:str(b.description,12000,true),priority};
  if(kind==='helpdesk'){if(!CATEGORIES.includes(b.category))fail('Invalid category');r.category=b.category;}
  else {if(!TYPES.includes(b.requestType))fail('Invalid request type');Object.assign(r,{requestType:b.requestType,employeeName:str(b.employeeName,120,true),employeePosition:str(b.employeePosition,120),employeePhone:str(b.employeePhone,30)});}
  return r;
}
export function makeRequest(kind,b,user){
  const r=fields(kind,b), createdAt=nowIso();
  return {...r,id:uid(),requesterUserId:user.id,status:'new',assigneeId:null,assigneeName:null,attachment:null,createdAt,slaDueAt:new Date(Date.now()+HOURS[r.priority]*3600000).toISOString(),assignedAt:null,resolvedAt:null,closedAt:null,reopenedAt:null,accountCreatedAt:null,whatsappSentAt:null,confirmedAt:null,accountDetails:null,whatsapp:null,submittedNotifiedAt:null,requesterConfirmedAt:null,assignedNotifiedAt:null,lastCommentNotifiedAt:null,resolvedNotifiedAt:null,reopenedNotifiedAt:null,slaWarningSentAt:null,slaBreachSentAt:null,accountCreatedNotifiedAt:null,whatsappSentNotifiedAt:null,confirmedNotifiedAt:null,closedNotifiedAt:null,importSource:null,importClickupId:null,importClickupUrl:null,version:1};
}
export function transition(kind,r,action,b,user,agents){
  if(!FLOWS[kind][r.status]?.includes(action))fail('This action is no longer available. Refresh and try again.',409);
  if(!user.isAdmin && !(action==='reopen' || (kind==='email'&&action==='confirm')))fail('Administrator access required',403);
  const next={...r}, now=nowIso();
  if(action==='assign'){const a=agents.find(a=>a.id===b.agentId);if(!a)fail('Select an agent');Object.assign(next,{assigneeId:a.id,assigneeName:a.name,assignedAt:now,status:'assigned',assignedNotifiedAt:null});}
  if(action==='start'||action==='resume')next.status='inprogress';
  if(action==='wait')next.status='waiting';
  if(action==='resolve')Object.assign(next,{status:'resolved',resolvedAt:now,resolvedNotifiedAt:null});
  if(action==='close')Object.assign(next,{status:'closed',closedAt:now,closedNotifiedAt:null});
  if(action==='reopen')Object.assign(next,{status:'reopened',reopenedAt:now,reopenedNotifiedAt:null,slaDueAt:new Date(Date.now()+HOURS[r.priority]*3600000).toISOString(),slaWarningSentAt:null,slaBreachSentAt:null});
  if(action==='provision'){
    const a=b.accountDetails||{};if(!['user','shared','resource'].includes(a.mailboxType))fail('Invalid mailbox type');
    const accountEmail=email(a.email),domain=str(a.domain,253,true).toLowerCase();if(accountEmail.split('@')[1]!==domain)fail('Account email must match the selected domain');
    next.accountDetails={email:accountEmail,domain,aliases:str(a.aliases,2000),groups:str(a.groups,2000),mailboxType:a.mailboxType,workspaceLicense:str(a.workspaceLicense,120),outlookConfigured:a.outlookConfigured===true,erpLinked:a.erpLinked===true,notes:str(a.notes,4000),createdBy:user.id};
    Object.assign(next,{status:'provisioned',accountCreatedAt:r.accountCreatedAt||now,accountCreatedNotifiedAt:r.status==='provisioned'?r.accountCreatedNotifiedAt:null,resolvedAt:now});
  }
  if(action==='whatsapp'){
    const phone=str(b.phone,25,true);if(!/^\+?[1-9]\d{7,14}$/.test(phone))fail('Use an international phone number');
    if(b.sentConfirmed!==true)fail('Confirm that you actually sent the WhatsApp message');
    next.whatsapp={phone,message:str(b.message,4000,true),sentAt:now,sentBy:user.id,confirmedAt:null};Object.assign(next,{status:'whatsapp_sent',whatsappSentAt:now,whatsappSentNotifiedAt:null});
  }
  if(action==='confirm'){Object.assign(next,{status:'confirmed',confirmedAt:now,confirmedNotifiedAt:null});next.whatsapp={...r.whatsapp,confirmedAt:now};}
  return next;
}
