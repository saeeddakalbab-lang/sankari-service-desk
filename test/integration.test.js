import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.js';
import {createApp} from '../server/app.js';
import {hashPassword,verifyPassword} from '../server/auth.js';
import {uid,nowIso,makeRequest,transition,overdue} from '../server/domain.js';
import {queueNotifications,drainMail,mailTemplate} from '../server/notifier.js';

const fixture={requesterName:'Employee One',requesterEmail:'one@example.com',department:'IT',company:'Sankari Holding',category:'network',subject:'Office connection issue',description:'Cannot connect to the office network',priority:'high'};
test('authenticated API, ownership, workflow, concurrency, comments, attachments and provisioning',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sankari-test-')),store=createStore(dir);
 const ids={};for(const [name,admin]of [['admin',1],['one',0],['two',0]]){ids[name]=uid();store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(ids[name],name+'@example.com',name,hashPassword('Long-test-password-12!'),admin,0,nowIso());}
 const app=createApp(store),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const cookies={};async function call(who,path,method='GET',body,extra={}){const headers={'X-Sankari-Client':'1',...extra};if(cookies[who])headers.Cookie=cookies[who];if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch(base+'/api'+path,{method,headers,body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});const type=r.headers.get('content-type');return {status:r.status,data:type?.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie'),headers:r.headers};}
 try{
  assert.equal((await call('none','/helpdesk/requests')).status,401);
  for(const who of ['admin','one','two']){const result=await call(who,'/login','POST',{email:who+'@example.com',password:'Long-test-password-12!'});assert.equal(result.status,200);assert.match(result.cookie,/HttpOnly/);assert.match(result.cookie,/SameSite=Strict/i);cookies[who]=result.cookie.split(';')[0];}
  assert.equal((await call('one','/me')).data.id,ids.one);
  assert.equal((await call('one','/users')).status,403);
  assert.equal((await call('one','/helpdesk/agents','POST',{name:'Fake',email:'fake@example.com'})).status,403);
  for(const kind of ['helpdesk','email'])assert.equal((await call('admin','/'+kind+'/agents')).data.length,5);
  assert.equal((await call('one','/helpdesk/requests','POST',fixture,{Origin:'https://evil.invalid'})).status,403);
  const csrf=await fetch(base+'/api/helpdesk/requests',{method:'POST',headers:{Cookie:cookies.one,'Content-Type':'application/json'},body:JSON.stringify(fixture)});assert.equal(csrf.status,403);
  assert.equal((await call('one','/helpdesk/requests','POST',{...fixture,priority:'invalid'})).status,400);
  let result=await call('one','/helpdesk/requests','POST',{...fixture,requesterUserId:ids.two,requesterEmail:'spoof@example.com'});assert.equal(result.status,201);let r=result.data;assert.equal(r.requesterUserId,ids.one);assert.equal(r.requesterEmail,'one@example.com');assert.equal((Date.parse(r.slaDueAt)-Date.parse(r.createdAt))/3600000,24);
  assert.equal((await call('two','/helpdesk/requests')).data.length,0);assert.equal((await call('admin','/helpdesk/requests')).data.length,1);
  for(const suffix of ['','/comments','/attachment'])assert.equal((await call('two','/helpdesk/requests/'+r.id+suffix)).status,404);
  assert.equal((await call('one','/email/requests/'+r.id)).status,404);
  assert.equal((await call('one','/helpdesk/requests/'+r.id,'PATCH',{subject:'hacked',if_version:1})).status,403);
  assert.equal((await call('one','/helpdesk/requests/'+r.id+'/actions','POST',{action:'assign',agentId:'saeed-dakalbab',if_version:1})).status,403);
  assert.equal((await call('admin','/helpdesk/requests/'+r.id+'/actions','POST',{action:'resolve',if_version:1})).status,409);
  const act=async(action,body={})=>{const result=await call('admin','/helpdesk/requests/'+r.id+'/actions','POST',{...body,action,if_version:r.version});assert.equal(result.status,200,JSON.stringify(result.data));r=result.data;};
  await act('assign',{agentId:'saeed-dakalbab'});assert.equal(r.status,'assigned');
  assert.equal((await call('admin','/helpdesk/requests/'+r.id,'PATCH',{subject:'stale',if_version:1})).status,409);
  assert.equal((await call('admin','/helpdesk/requests/'+r.id,'PATCH',{subject:'missing version'})).status,428);
  await act('start');await act('wait');
  const c=await call('one','/helpdesk/requests/'+r.id+'/comments','POST',{body:'I have tested it',if_version:r.version});assert.equal(c.status,201);r=(await call('one','/helpdesk/requests/'+r.id)).data;assert.equal(r.status,'inprogress');assert.equal((await call('admin','/helpdesk/requests/'+r.id+'/comments')).data.length,1);
  const badComment=await call('one','/helpdesk/requests/'+r.id+'/comments','POST',{body:'Stale comment',if_version:1});assert.equal(badComment.status,409);assert.equal((await call('admin','/helpdesk/requests/'+r.id+'/comments')).data.length,1);
  const fd=new FormData();fd.set('file',new Blob(['Safe attachment']),'notes.txt');fd.set('if_version',String(r.version));const uploaded=await call('one','/helpdesk/requests/'+r.id+'/attachment','POST',fd);assert.equal(uploaded.status,200);r=uploaded.data;assert.equal((await call('one','/helpdesk/requests/'+r.id+'/attachment')).data,'Safe attachment');assert.equal((await call('two','/helpdesk/requests/'+r.id+'/attachment')).status,404);
  const bad=new FormData();bad.set('file',new Blob(['<script>bad</script>']),'attack.html');bad.set('if_version',String(r.version));assert.equal((await call('one','/helpdesk/requests/'+r.id+'/attachment','POST',bad)).status,400);
  await act('resolve');assert.ok(r.resolvedAt);await act('close');assert.equal(overdue('helpdesk',{...r,slaDueAt:'2020-01-01'}),false);
  const reopened=await call('one','/helpdesk/requests/'+r.id+'/actions','POST',{action:'reopen',if_version:r.version});assert.equal(reopened.status,200);r=reopened.data;assert.equal(r.status,'reopened');assert.ok(Date.parse(r.slaDueAt)>Date.now());
  let er=(await call('one','/email/requests','POST',{...fixture,requestType:'new_account',employeeName:'New employee',employeePhone:'+963999123456'})).data;
  const eact=async(action,body={},who='admin')=>{const response=await call(who,'/email/requests/'+er.id+'/actions','POST',{...body,action,if_version:er.version});assert.equal(response.status,200,JSON.stringify(response.data));er=response.data;};
  await eact('assign',{agentId:'sami-hijlawi'});await eact('start');await eact('wait');await eact('resume');
  const account={email:'new@example.com',domain:'example.com',mailboxType:'user',aliases:'',groups:'Everyone',workspaceLicense:'Business Standard',outlookConfigured:true,erpLinked:false,notes:'No passwords stored'};
  assert.equal((await call('admin','/email/requests/'+er.id+'/actions','POST',{action:'provision',accountDetails:{...account,domain:'different.com'},if_version:er.version})).status,400);
  await eact('provision',{accountDetails:account});assert.equal(er.status,'provisioned');assert.equal(overdue('email',{...er,slaDueAt:'2020-01-01'}),false);
  assert.equal((await call('admin','/email/requests/'+er.id+'/actions','POST',{action:'whatsapp',phone:'+963999123456',message:'Your account is ready',if_version:er.version})).status,400);
  await eact('whatsapp',{phone:'+963999123456',message:'Your account is ready',sentConfirmed:true});assert.ok(er.whatsapp.sentAt);
  await eact('confirm',{},'one');assert.ok(er.whatsapp.confirmedAt);await eact('close');assert.equal(er.status,'closed');
  assert.equal((await call('admin','/helpdesk/requests')).data.length,1);assert.equal((await call('admin','/email/requests')).data.length,1);
  const createdUser=await call('admin','/users','POST',{name:'Another',email:'another@example.com',password:'Long-password-for-user',isAdmin:false});assert.equal(createdUser.status,201);
  assert.equal((await call('admin','/users/'+ids.two,'PATCH',{disabled:true})).status,200);assert.equal((await call('two','/me')).status,401);
  assert.equal((await call('admin','/helpdesk/requests/'+r.id,'DELETE',{if_version:1})).status,409);
  const uploadedPath=join(dir,'uploads',r.attachment.id);assert.ok(existsSync(uploadedPath));assert.equal((await call('admin','/helpdesk/requests/'+r.id,'DELETE',{if_version:r.version})).status,200);assert.equal(existsSync(uploadedPath),false);assert.equal(store.comments(r.id).length,0);
  assert.equal((await call('one','/password','POST',{current:'Long-test-password-12!',password:'New-secure-password12!'})).status,200);assert.equal((await call('one','/me')).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true});}
});

test('notification outbox is idempotent, retryable, escaped and respects SLA terminal states',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sankari-mail-')),store=createStore(dir),id=uid();store.db.prepare('INSERT INTO users VALUES(?,?,?,?,0,0,?)').run(id,'employee@example.com','Employee',hashPassword('Long-test-password-12!'),nowIso());
 try{
  let r=makeRequest('email',{...fixture,requestType:'new_account',employeeName:'New employee',subject:'<img src=x onerror=alert(1)>'},{id});r.slaDueAt=new Date(Date.now()-60000).toISOString();store.insert('email',r);
  assert.equal(queueNotifications(store,'email','https://support.example.com'),3);assert.equal(queueNotifications(store,'email','https://support.example.com'),0);
  const jobs=store.db.prepare('SELECT * FROM mail_jobs').all();assert.equal(jobs.length,3);assert.ok(jobs.every(j=>!j.html.includes('<img src=x')));assert.ok(jobs[0].html.includes('&lt;img'));assert.match(jobs[0].text,/https:\/\/support.example.com\/email\?request=/);
  await drainMail(store,{sendMail:async()=>{throw Error('temporary SMTP failure');}});assert.equal(store.db.prepare("SELECT count(*) n FROM mail_jobs WHERE status='sent'").get().n,0);assert.equal(store.db.prepare('SELECT attempts FROM mail_jobs LIMIT 1').get().attempts,1);
  let delivered=0;const transport={sendMail:async msg=>{assert.ok(msg.text&&msg.html&&msg.messageId);delivered++;}};await drainMail(store,transport);await drainMail(store,transport);assert.equal(delivered,3);
  const other={...makeRequest('email',{...fixture,requestType:'new_account',employeeName:'Other'},{id}),status:'provisioned',slaDueAt:'2000-01-01',accountCreatedAt:nowIso(),accountDetails:{email:'other@example.com'}};store.insert('email',other);queueNotifications(store,'email','https://support.example.com');const otherJobs=store.db.prepare('SELECT subject FROM mail_jobs WHERE request_id=?').all(other.id);assert.ok(otherJobs.every(j=>!j.subject.includes('SLA')));assert.equal(otherJobs.length,4);
  const message=mailTemplate('helpdesk',r,'Test','<script>','https://support.example.com');assert.ok(message.html.includes('&lt;script&gt;'));assert.ok(message.text.includes('?ticket='));
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('passwords use per-password salts and reject incorrect values',()=>{const one=hashPassword('A-long-password-123'),two=hashPassword('A-long-password-123');assert.notEqual(one,two);assert.equal(verifyPassword('A-long-password-123',one),true);assert.equal(verifyPassword('wrong',one),false);assert.throws(()=>hashPassword('short'));});
