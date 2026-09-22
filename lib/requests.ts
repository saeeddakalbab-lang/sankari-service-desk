import type { PoolClient } from "pg";
import { query, transaction } from "./db";
import { queueMail } from "./mail";
import { CLOSED_BY_TYPE, SLA_HOURS, STATUS_BY_TYPE, type RequestRecord, type User } from "./types";
import { assertStatus } from "./validation";

const select=`SELECT r.*,u.name assignee_name FROM requests r LEFT JOIN users u ON u.id=r.assignee_id`;
export const canManage=(u:User)=>u.roles.includes("admin")||u.roles.includes("agent");
export async function listRequests(user:User,all=false){const full=canManage(user)&&all;const r=await query<RequestRecord>(`${select} ${full?"":"WHERE r.requester_user_id=$1 OR lower(r.requester_email)=lower($2)"} ORDER BY r.created_at DESC LIMIT 500`,full?[]:[user.id,user.email]);return r.rows;}
export async function getRequest(id:string,user:User){const r=await query<RequestRecord>(`${select} WHERE r.id=$1`,[id]);const item=r.rows[0];if(!item||(!canManage(user)&&item.requester_user_id!==user.id&&item.requester_email.toLowerCase()!==user.email.toLowerCase()))return null;return item;}
export async function createRequest(input:any,user:User,ipHash:string){
  const hours=SLA_HOURS[input.priority as keyof typeof SLA_HOURS],status=input.type==="subscription_approval"?"new":"new";
  const result=await transaction(async c=>{const r=await c.query<RequestRecord>(`INSERT INTO requests(type,requester_user_id,requester_name,requester_email,department,company,subject,description,priority,status,sla_due_at,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+($11||' hours')::interval,$12) RETURNING *`,[input.type,user.id,user.name,user.email,input.department,input.company,input.subject,input.description,input.priority,status,hours,JSON.stringify(input.details)]);await c.query(`INSERT INTO audit_log(actor_id,request_id,action,after_data,ip_hash) VALUES($1,$2,'request.created',$3,$4)`,[user.id,r.rows[0].id,JSON.stringify(r.rows[0]),ipHash]);return r.rows[0];});
  await queueMail("submitted-requester",result,user.email,"Request received","Your request was received and is now visible in the portal.");
  const admins=await query<{email:string}>(`SELECT email FROM users WHERE roles&&ARRAY['admin','agent']::text[] AND disabled_at IS NULL`);for(const a of admins.rows)await queueMail("submitted-team",result,a.email,"New request",`${user.name} submitted a new request.`);return result;
}
export async function transitionRequest(id:string,input:{status:string;assigneeId?:string|null;version:number;details?:Record<string,unknown>},user:User,ipHash:string){
  if(!canManage(user))throw new Error("Forbidden");
  const transition=await transaction(async c=>{const old=(await c.query<RequestRecord>(`SELECT * FROM requests WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!old)throw new Error("Request not found");if(old.version!==input.version)throw new Error("Version conflict: reload the request");assertStatus(old.type,input.status);
    const allowed=STATUS_BY_TYPE[old.type];if(!allowed.includes(input.status))throw new Error("Invalid status");
    const assigned=input.assigneeId!==undefined?input.assigneeId:old.assignee_id;
    const terminal=CLOSED_BY_TYPE[old.type].includes(input.status),reopened=input.status==="reopened";
    const resolved=reopened?null:terminal&&!old.resolved_at?new Date():old.resolved_at;
    const r=await c.query<RequestRecord>(`UPDATE requests SET status=$2,assignee_id=$3,details=details||$4::jsonb,assigned_at=CASE WHEN $3::uuid IS NOT NULL AND assigned_at IS NULL THEN now() ELSE assigned_at END,resolved_at=$5,closed_at=CASE WHEN $2='reopened' THEN NULL WHEN $2='closed' THEN coalesce(closed_at,now()) ELSE closed_at END,reopened_at=CASE WHEN $2='reopened' THEN now() ELSE reopened_at END,version=version+1 WHERE id=$1 AND version=$6 RETURNING *`,[id,input.status,assigned,JSON.stringify(input.details||{}),resolved,input.version]);
    if(!r.rowCount)throw new Error("Version conflict: reload the request");await audit(c,user.id,id,"request.transition",old,r.rows[0],ipHash);return {record:r.rows[0],assignedNow:!!assigned&&assigned!==old.assignee_id,resolvedNow:!!r.rows[0].resolved_at&&!old.resolved_at};});
  const saved=transition.record;
  if(transition.assignedNow&&saved.assignee_id){const a=await query<{email:string}>(`SELECT email FROM users WHERE id=$1`,[saved.assignee_id]);if(a.rows[0])await queueMail(`assigned-${saved.version}`,saved,a.rows[0].email,"Request assigned",`A request has been assigned to you.`);}
  if(transition.resolvedNow)await queueMail(`resolved-${saved.version}`,saved,saved.requester_email,"Request updated",`Your request is now ${saved.status}.`);return saved;
}
export async function addComment(id:string,body:string,internal:boolean,version:number,user:User,ipHash:string){
  const request=await getRequest(id,user);if(!request)throw new Error("Request not found");if(internal&&!canManage(user))throw new Error("Forbidden");if(request.version!==version)throw new Error("Version conflict: reload the request");
  const result=await transaction(async c=>{const r=await c.query(`INSERT INTO comments(request_id,author_id,author_name,body,internal) VALUES($1,$2,$3,$4,$5) RETURNING *`,[id,user.id,user.name,body,internal]);const up=await c.query(`UPDATE requests SET version=version+1 WHERE id=$1 AND version=$2`,[id,version]);if(!up.rowCount)throw new Error("Version conflict: reload the request");await c.query(`INSERT INTO audit_log(actor_id,request_id,action,after_data,ip_hash) VALUES($1,$2,'comment.created',$3,$4)`,[user.id,id,JSON.stringify({id:r.rows[0].id,internal}),ipHash]);return r.rows[0];});
  if(!internal){const recipient=canManage(user)?request.requester_email:(await query<{email:string}>(`SELECT email FROM users WHERE id=$1`,[request.assignee_id])).rows[0]?.email; if(recipient)await queueMail(`comment-${result.id}`,request,recipient,"New comment",`${user.name} added a comment.`);}return result;
}
export async function listComments(id:string,user:User){const request=await getRequest(id,user);if(!request)return null;const r=await query(`SELECT * FROM comments WHERE request_id=$1 ${canManage(user)?"":"AND internal=false"} ORDER BY created_at`,[id]);return r.rows;}
async function audit(c:PoolClient,actor:string,request:string,action:string,before:any,after:any,ip:string){await c.query(`INSERT INTO audit_log(actor_id,request_id,action,before_data,after_data,ip_hash) VALUES($1,$2,$3,$4,$5,$6)`,[actor,request,action,JSON.stringify(before),JSON.stringify(after),ip]);}
