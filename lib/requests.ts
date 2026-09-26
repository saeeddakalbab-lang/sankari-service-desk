import type { PoolClient } from "pg";
import { approvalsEnabled, buildChain, insertSteps, isApproverOn } from "./approvals";
import { getRules, needsApprovalUnder, slaHoursFor } from "./rules";
import { query, transaction } from "./db";
import { AppError, forbidden } from "./errors";
import { queueMail,queueTicketAlert } from "./mail";
import { issueTicketLinks } from "./actions";
import { refFor } from "./format";
import { usdToAedCents } from "./money";
import { getEmailDomains, getUsdToAedRate } from "./settings";
import { APPROVAL_STATUSES, CLOSED_BY_TYPE, STATUS_BY_TYPE, type RequestRecord, type User } from "./types";
import { assertStatus } from "./validation";

const select=`SELECT r.*,u.name assignee_name FROM requests r LEFT JOIN users u ON u.id=r.assignee_id`;
export const canManage=(u:User)=>u.roles.includes("admin")||u.roles.includes("agent");
export async function listRequests(user:User,all=false){const full=canManage(user)&&all;const r=await query<RequestRecord>(`${select} ${full?"":"WHERE r.requester_user_id=$1 OR lower(r.requester_email)=lower($2)"} ORDER BY r.created_at DESC LIMIT 500`,full?[]:[user.id,user.email]);return r.rows;}
export async function getRequest(id:string,user:User){const r=await query<RequestRecord>(`${select} WHERE r.id=$1`,[id]);const item=r.rows[0];if(!item)return null;const own=item.requester_user_id===user.id||item.requester_email.toLowerCase()===user.email.toLowerCase();if(!canManage(user)&&!own&&!(item.approval_required&&await isApproverOn(id,user.id)))return null;return item;}
export async function createRequest(input:any,user:User,ipHash:string){
  // Rules decide the SLA and the approval line; both are copied onto the request now and never recomputed.
  const rules=await getRules(),hours=slaHoursFor(rules,input.priority);
  if(input.type==="email_account_request"){
    const {domains}=await getEmailDomains();
    if(!domains.includes(String(input.details.domain).toLowerCase()))throw new AppError("That email domain is not one of the company's Workspace domains");
    input.details.domain=String(input.details.domain).toLowerCase();
  }
  if(input.type==="subscription_approval"&&input.details.amountCents!==undefined){
    // Freeze the exchange rate on the request at submission; later rate changes never rewrite it.
    const rate=await getUsdToAedRate(),cents=BigInt(input.details.amountCents);
    input.details.usdToAedRate=rate;
    input.details.amountAedCents=(input.details.currency==="USD"?usdToAedCents(cents,rate):cents).toString();
    input.details.amountCents=cents.toString();
  }
  const result=await transaction(async c=>{
    // The approval chain is resolved and frozen in the same transaction as the request.
    const chain=needsApprovalUnder(rules,input.type)&&await approvalsEnabled(c)?await buildChain(c,user.id):null;
    const r=await c.query<RequestRecord>(`INSERT INTO requests(type,requester_user_id,requester_name,requester_email,department,company,subject,description,priority,status,sla_due_at,details,approval_required) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+($11||' hours')::interval,$12,$13) RETURNING *`,[input.type,user.id,user.name,user.email,input.department,input.company,input.subject,input.description,input.priority,chain?"awaiting_approval":"new",hours,JSON.stringify(input.details),!!chain]);
    const saved=r.rows[0];
    await c.query(`INSERT INTO audit_log(actor_id,request_id,action,after_data,ip_hash) VALUES($1,$2,'request.created',$3,$4)`,[user.id,saved.id,JSON.stringify(saved),ipHash]);
    if(chain){await insertSteps(c,saved.id,chain);await c.query(`INSERT INTO audit_log(actor_id,request_id,action,after_data,ip_hash) VALUES($1,$2,'approval.chain_created',$3,$4)`,[user.id,saved.id,JSON.stringify(chain.map(({approverUserId,approverName,approverRole})=>({approverUserId,approverName,approverRole}))),ipHash]);}
    return {saved,chain};
  });
  const {saved,chain}=result;
  if(chain){
    await queueMail("submitted-requester",saved,user.email,{k:"receivedApproval",p:{approver:chain[0].approverName}});
    if(rules.notifications.emailApprover)await queueMail("approval-needed-1",saved,chain[0].approverEmail,{k:"approvalNeeded",p:{requester:user.name}});
    return saved;
  }
  await queueMail("submitted-requester",saved,user.email,{k:"received"});
  if(saved.type==="helpdesk_ticket"&&!rules.notifications.emailAdminOnTicket)return saved;
  const admins=await query<{id:string;email:string}>(`SELECT id,email FROM users WHERE roles&&ARRAY['admin','agent']::text[] AND disabled_at IS NULL`);
  const ref=refFor(saved.type,saved.id,String(saved.created_at));
  for(const a of admins.rows){
    if(saved.type==="helpdesk_ticket"&&a.id!==user.id)await queueTicketAlert(saved,a.email,ref,await issueTicketLinks(null,saved.id,a.id));
    else if(saved.type!=="helpdesk_ticket")await queueMail("submitted-team",saved,a.email,{k:"newRequest",p:{requester:user.name}});
  }
  return saved;
}
export async function transitionRequest(id:string,input:{status:string;assigneeId?:string|null;version:number;details?:Record<string,unknown>},user:User,ipHash:string){
  if(!canManage(user))throw forbidden();
  const transition=await transaction(async c=>{const old=(await c.query<RequestRecord>(`SELECT * FROM requests WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!old)throw new Error("Request not found");if(old.version!==input.version)throw new Error("Version conflict: reload the request");assertStatus(old.type,input.status);
    if(old.approval_required){
      if(old.status==="awaiting_approval"||old.status==="rejected")throw new AppError("This request cannot be fulfilled until every approver has approved",409);
      if(input.status!==old.status&&(APPROVAL_STATUSES as readonly string[]).includes(input.status))throw new AppError("Approval status comes from the approval line and cannot be set by hand",409);
    }
    const allowed=STATUS_BY_TYPE[old.type];if(!allowed.includes(input.status))throw new Error("Invalid status");
    const assigned=input.assigneeId!==undefined?input.assigneeId:old.assignee_id;
    // On the approval line "approved" means ready for fulfilment, not finished.
    const terminal=CLOSED_BY_TYPE[old.type].includes(input.status)&&!(old.approval_required&&input.status==="approved"),reopened=input.status==="reopened";
    const resolved=reopened?null:terminal&&!old.resolved_at?new Date():old.resolved_at;
    const r=await c.query<RequestRecord>(`UPDATE requests SET status=$2,assignee_id=$3,details=details||$4::jsonb,assigned_at=CASE WHEN $3::uuid IS NOT NULL AND assigned_at IS NULL THEN now() ELSE assigned_at END,resolved_at=$5,closed_at=CASE WHEN $2='reopened' THEN NULL WHEN $2='closed' THEN coalesce(closed_at,now()) ELSE closed_at END,reopened_at=CASE WHEN $2='reopened' THEN now() ELSE reopened_at END,version=version+1 WHERE id=$1 AND version=$6 RETURNING *`,[id,input.status,assigned,JSON.stringify(input.details||{}),resolved,input.version]);
    if(!r.rowCount)throw new Error("Version conflict: reload the request");await audit(c,user.id,id,"request.transition",old,r.rows[0],ipHash);return {record:r.rows[0],assignedNow:!!assigned&&assigned!==old.assignee_id,resolvedNow:!!r.rows[0].resolved_at&&!old.resolved_at};});
  const saved=transition.record;
  if(transition.assignedNow&&saved.assignee_id){const a=await query<{email:string}>(`SELECT email FROM users WHERE id=$1`,[saved.assignee_id]);if(a.rows[0])await queueMail(`assigned-${saved.version}`,saved,a.rows[0].email,{k:"assigned"});}
  if(transition.resolvedNow)await queueMail(`resolved-${saved.version}`,saved,saved.requester_email,{k:"resolved",p:{status:saved.status}});return saved;
}
export async function addComment(id:string,body:string,internal:boolean,version:number,user:User,ipHash:string){
  const request=await getRequest(id,user);if(!request)throw new Error("Request not found");if(internal&&!canManage(user))throw new Error("Forbidden");void version;
  // A comment adds to the thread and never conflicts with a status change, so it does not require the caller's version; it still bumps it.
  const result=await transaction(async c=>{const r=await c.query(`INSERT INTO comments(request_id,author_id,author_name,body,internal) VALUES($1,$2,$3,$4,$5) RETURNING *`,[id,user.id,user.name,body,internal]);await c.query(`UPDATE requests SET version=version+1 WHERE id=$1`,[id]);await c.query(`INSERT INTO audit_log(actor_id,request_id,action,after_data,ip_hash) VALUES($1,$2,'comment.created',$3,$4)`,[user.id,id,JSON.stringify({id:r.rows[0].id,internal}),ipHash]);return r.rows[0];});
  if(!internal){const recipient=canManage(user)?request.requester_email:(await query<{email:string}>(`SELECT email FROM users WHERE id=$1`,[request.assignee_id])).rows[0]?.email; if(recipient)await queueMail(`comment-${result.id}`,request,recipient,{k:"comment",p:{author:user.name}},{comment:body});}return result;
}
export async function listComments(id:string,user:User){const request=await getRequest(id,user);if(!request)return null;const r=await query(`SELECT * FROM comments WHERE request_id=$1 ${canManage(user)?"":"AND internal=false"} ORDER BY created_at`,[id]);return r.rows;}
async function audit(c:PoolClient,actor:string,request:string,action:string,before:any,after:any,ip:string){await c.query(`INSERT INTO audit_log(actor_id,request_id,action,before_data,after_data,ip_hash) VALUES($1,$2,$3,$4,$5,$6)`,[actor,request,action,JSON.stringify(before),JSON.stringify(after),ip]);}
