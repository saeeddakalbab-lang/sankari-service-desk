import type { PoolClient } from "pg";
import { pool, query, transaction } from "./db";
import { AppError, conflict, forbidden } from "./errors";
import { queueMail } from "./mail";
import { getRules } from "./rules";
import { APPROVAL_TYPES, type ApprovalRole, type ApprovalStep, type RequestRecord, type RequestType, type User } from "./types";

type Person={id:string;name:string;email:string};
export type ChainStep={approverUserId:string;approverName:string;approverEmail:string;approverRole:ApprovalRole};

export const needsApproval=(type:RequestType)=>APPROVAL_TYPES.includes(type);

export async function approvalsEnabled(db:{query:PoolClient["query"]}=pool){
  const r=await db.query<{value:{enabled?:boolean}}>(`SELECT value FROM settings WHERE key='approvals'`);
  return r.rows[0]?.value?.enabled===true;
}

// Employee -> Manager -> CEO, with nobody ever approving their own request:
//   requester is the CEO      -> their manager only
//   requester is a manager    -> straight to the CEO
//   everyone else             -> their manager, then the CEO (collapsed if the manager is the CEO)
// A missing approver is an error, never a skipped step.
export function resolveChain(input:{requester:Person;isCeo:boolean;isManager:boolean;manager:Person|null;ceo:Person|null}):ChainStep[]{
  const {requester,isCeo,isManager,manager,ceo}=input;
  const step=(p:Person,role:ApprovalRole):ChainStep=>({approverUserId:p.id,approverName:p.name,approverEmail:p.email,approverRole:role});
  let chain:ChainStep[];
  if(isCeo){
    if(!manager)throw new AppError("No approver is configured for the CEO. An administrator must set the CEO's manager in Settings.");
    chain=[step(manager,"manager")];
  }else{
    if(!ceo)throw new AppError("No CEO is configured. An administrator must assign the CEO role in Settings.");
    if(isManager)chain=[step(ceo,"ceo")];
    else{
      if(!manager)throw new AppError("You have no manager assigned. Ask an administrator to set your manager in Settings.");
      chain=manager.id===ceo.id?[step(ceo,"ceo")]:[step(manager,"manager"),step(ceo,"ceo")];
    }
  }
  if(chain.some(s=>s.approverUserId===requester.id))throw new AppError("The approval chain would include the requester. Check the reporting line in Settings.");
  return chain;
}

export async function buildChain(db:{query:PoolClient["query"]},userId:string){
  const me=(await db.query<Person&{manager_user_id:string|null;roles:string[]}>(`SELECT id,name,email,manager_user_id,roles FROM users WHERE id=$1 AND disabled_at IS NULL`,[userId])).rows[0];
  if(!me)throw new AppError("Your user record was not found",404);
  const manager=me.manager_user_id?(await db.query<Person>(`SELECT id,name,email FROM users WHERE id=$1 AND disabled_at IS NULL`,[me.manager_user_id])).rows[0]??null:null;
  if(me.manager_user_id&&!manager)throw new AppError("Your manager's account is disabled. Ask an administrator to update your manager in Settings.");
  const ceo=(await db.query<Person>(`SELECT id,name,email FROM users WHERE 'ceo'=ANY(roles) AND disabled_at IS NULL`)).rows[0]??null;
  const reports=await db.query(`SELECT 1 FROM users WHERE manager_user_id=$1 AND disabled_at IS NULL LIMIT 1`,[userId]);
  return resolveChain({requester:me,isCeo:me.roles.includes("ceo"),isManager:!!reports.rowCount||me.roles.includes("manager"),manager,ceo});
}

export async function insertSteps(c:PoolClient,requestId:string,chain:ChainStep[]){
  for(const [i,s] of chain.entries())await c.query(`INSERT INTO approval_steps(request_id,step_no,approver_user_id,approver_role,approver_name) VALUES($1,$2,$3,$4,$5)`,[requestId,i+1,s.approverUserId,s.approverRole,s.approverName]);
}

export async function listSteps(requestId:string){
  return (await query<ApprovalStep>(`SELECT s.*,u.name skipped_by_name FROM approval_steps s LEFT JOIN users u ON u.id=s.skipped_by_user_id WHERE s.request_id=$1 ORDER BY s.step_no`,[requestId])).rows;
}

export async function isApproverOn(requestId:string,userId:string){
  return !!(await query(`SELECT 1 FROM approval_steps WHERE request_id=$1 AND approver_user_id=$2`,[requestId,userId])).rowCount;
}

export const currentStep=(steps:ApprovalStep[])=>steps.some(s=>s.status==="rejected")?null:steps.find(s=>s.status==="waiting")??null;

// Requests waiting on this user right now, with the context needed to decide without opening them.
export async function listPendingFor(user:User){
  const r=await query(`WITH cur AS (
      SELECT DISTINCT ON (s.request_id) s.* FROM approval_steps s
       WHERE NOT EXISTS (SELECT 1 FROM approval_steps x WHERE x.request_id=s.request_id AND x.status='rejected')
         AND s.status='waiting'
       ORDER BY s.request_id,s.step_no)
    SELECT r.id,r.type,r.subject,r.description,r.requester_name,r.requester_email,r.department,r.company,r.priority,r.details,r.created_at,r.sla_due_at,r.version,
           cur.id step_id,cur.step_no,cur.approver_role,
           prev.approver_name previous_approver_name,prev.comment previous_comment,prev.decided_at previous_decided_at
      FROM cur JOIN requests r ON r.id=cur.request_id
      LEFT JOIN approval_steps prev ON prev.request_id=cur.request_id AND prev.step_no=cur.step_no-1
     WHERE cur.approver_user_id=$1 AND r.status='awaiting_approval'
     ORDER BY r.created_at`,[user.id]);
  return r.rows;
}

export async function decide(requestId:string,decision:"approve"|"reject",comment:string,user:User,ipHash:string){
  const result=await transaction(async c=>{
    const request=(await c.query<RequestRecord>(`SELECT * FROM requests WHERE id=$1 FOR UPDATE`,[requestId])).rows[0];
    if(!request)throw new AppError("Request not found",404);
    if(!request.approval_required)throw new AppError("This request does not use the approval line");
    if(request.requester_user_id===user.id||request.requester_email.toLowerCase()===user.email.toLowerCase())throw forbidden("You cannot approve or reject your own request");
    const steps=(await c.query<ApprovalStep>(`SELECT * FROM approval_steps WHERE request_id=$1 ORDER BY step_no FOR UPDATE`,[requestId])).rows;
    if(steps.some(s=>s.status==="rejected"))throw conflict("This request was already rejected");
    const step=currentStep(steps);
    if(!step)throw conflict("This request has already been fully approved");
    if(step.approver_user_id!==user.id)throw forbidden("You are not the current approver for this request");
    if(decision==="reject"&&!comment.trim())throw new AppError("A reason is required to reject a request");
    const updated=await c.query<ApprovalStep>(`UPDATE approval_steps SET status=$2,decided_at=now(),comment=nullif(btrim($3),'') WHERE id=$1 AND status='waiting' RETURNING *`,[step.id,decision==="approve"?"approved":"rejected",comment]);
    if(!updated.rowCount)throw conflict("This step was decided by someone else; reload the request");
    const after=(await c.query<RequestRecord>(`SELECT * FROM requests WHERE id=$1`,[requestId])).rows[0];
    await c.query(`INSERT INTO audit_log(actor_id,request_id,action,before_data,after_data,ip_hash) VALUES($1,$2,$3,$4,$5,$6)`,
      [user.id,requestId,decision==="approve"?"approval.approved":"approval.rejected",JSON.stringify({step,status:request.status}),JSON.stringify({step:updated.rows[0],status:after.status}),ipHash]);
    const next=decision==="approve"?steps.find(s=>s.step_no>step.step_no&&s.status==="waiting")??null:null;
    return {request:after,step:updated.rows[0],next};
  });
  const {request,step,next}=result;
  if(step.status==="rejected"){
    await queueMail(`approval-rejected-${step.id}`,request,request.requester_email,{k:"rejected",p:{by:user.name,reason:String(step.comment??"")}});
  }else if(next){
    const nextEmail=(await query<{email:string}>(`SELECT email FROM users WHERE id=$1`,[next.approver_user_id])).rows[0]?.email;
    await queueMail(`approval-approved-${step.id}`,request,request.requester_email,{k:"progressed",p:{by:user.name,next:next.approver_name}});
    if(nextEmail&&(await getRules()).notifications.emailApprover)await queueMail(`approval-needed-${next.id}`,request,nextEmail,{k:"approvalNeededNext",p:{requester:request.requester_name,by:user.name}});
  }else{
    await queueMail(`approval-complete-${step.id}`,request,request.requester_email,{k:"approvedAll"});
    const team=await query<{email:string}>(`SELECT email FROM users WHERE roles&&ARRAY['admin','agent']::text[] AND disabled_at IS NULL`);
    for(const a of team.rows)await queueMail(`approval-fulfil-${step.id}`,request,a.email,{k:"fulfil",p:{requester:request.requester_name}});
  }
  return {request,step};
}

// Approval steps for many requests at once (dashboard rows), keyed by request id.
export async function stepsForRequests(ids:string[]){
  const map=new Map<string,ApprovalStep[]>();if(!ids.length)return map;
  const r=await query<ApprovalStep>(`SELECT s.*,u.name skipped_by_name FROM approval_steps s LEFT JOIN users u ON u.id=s.skipped_by_user_id WHERE s.request_id=ANY($1::uuid[]) ORDER BY s.request_id,s.step_no`,[ids]);
  for(const s of r.rows)map.set(s.request_id,[...(map.get(s.request_id)||[]),s]);return map;
}
// Whether this user should see the Approvals menu: they hold a waiting step, are the CEO, or manage someone.
export async function approvalsBadge(user:User){
  const [pending,reports]=await Promise.all([listPendingFor(user),query(`SELECT 1 FROM users WHERE manager_user_id=$1 AND disabled_at IS NULL LIMIT 1`,[user.id])]);
  return {count:pending.length,show:pending.length>0||user.roles.includes("ceo")||!!reports.rowCount};
}

// Who may skip a silent approver. Never the requester, never the approver of that step.
export const SKIP_ROLES=["owner","ceo","board"] as const;
export const canSkip=(u:User)=>SKIP_ROLES.some(r=>u.roles.includes(r));

// A person skips the CURRENT step after it has waited longer than the rule allows. The database
// trigger re-checks every condition; this function exists to give clear errors and send the emails.
export async function skipStep(requestId:string,reason:string,user:User,ipHash:string){
  const rules=await getRules();
  const result=await transaction(async c=>{
    const request=(await c.query<RequestRecord>(`SELECT * FROM requests WHERE id=$1 FOR UPDATE`,[requestId])).rows[0];
    if(!request)throw new AppError("Request not found",404);
    if(!canSkip(user))throw forbidden("Only the Owner, the CEO or a Board member can skip an approver");
    if(!request.approval_required||request.status!=="awaiting_approval")throw conflict("This request is not waiting for an approver");
    if(request.requester_user_id===user.id||request.requester_email.toLowerCase()===user.email.toLowerCase())throw forbidden("You cannot skip a step on your own request");
    const steps=(await c.query<ApprovalStep>(`SELECT * FROM approval_steps WHERE request_id=$1 ORDER BY step_no FOR UPDATE`,[requestId])).rows;
    const step=currentStep(steps);
    if(!step)throw conflict("This request has no step waiting");
    if(step.approver_user_id===user.id)throw forbidden("This step is yours: approve or reject it instead");
    if(!reason.trim())throw new AppError("A reason is required to skip an approver");
    const since=new Date(steps.find(s=>s.step_no===step.step_no-1)?.decided_at||request.created_at).getTime();
    if(Date.now()-since<rules.skipAfterHours*3600000)throw conflict(`This step can be skipped only after ${rules.skipAfterHours} hours without an answer`);
    const updated=await c.query<ApprovalStep>(`UPDATE approval_steps SET status='skipped',decided_at=now(),skipped_by_user_id=$2,skip_reason=btrim($3) WHERE id=$1 AND status='waiting' RETURNING *`,[step.id,user.id,reason]);
    if(!updated.rowCount)throw conflict("This step was decided by someone else; reload the request");
    const after=(await c.query<RequestRecord>(`SELECT * FROM requests WHERE id=$1`,[requestId])).rows[0];
    await c.query(`INSERT INTO audit_log(actor_id,request_id,action,before_data,after_data,ip_hash) VALUES($1,$2,'approval.skipped',$3,$4,$5)`,[user.id,requestId,JSON.stringify({step,status:request.status}),JSON.stringify({step:updated.rows[0],status:after.status,skippedBy:user.email,reason:reason.trim()}),ipHash]);
    const next=steps.find(s=>s.step_no>step.step_no&&s.status==="waiting")??null;
    return {request:after,step:updated.rows[0],next};
  });
  const {request,step,next}=result;
  await queueMail(`approval-skipped-${step.id}`,request,request.requester_email,{k:"skipped",p:{by:user.name,skipped:step.approver_name,reason:String(step.skip_reason??"")}});
  if(next){
    const nextEmail=(await query<{email:string}>(`SELECT email FROM users WHERE id=$1`,[next.approver_user_id])).rows[0]?.email;
    if(nextEmail&&rules.notifications.emailApprover)await queueMail(`approval-needed-${next.id}`,request,nextEmail,{k:"approvalNeededSkip",p:{requester:request.requester_name,skipped:step.approver_name,reason:String(step.skip_reason??"")}});
  }else{
    const team=await query<{email:string}>(`SELECT email FROM users WHERE roles&&ARRAY['admin','agent']::text[] AND disabled_at IS NULL`);
    for(const a of team.rows)await queueMail(`approval-fulfil-${step.id}`,request,a.email,{k:"fulfil",p:{requester:request.requester_name}});
  }
  return {request,step};
}
