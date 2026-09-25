import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { query,transaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { PERSON_TYPES,SINGLE_HOLDER,placeholderName,rolesForType } from "@/lib/people";
import { getEmailDomains } from "@/lib/settings";
export const dynamic="force-dynamic";

const addSchema=z.object({email:z.string().trim().toLowerCase().email().max(254),name:z.string().trim().max(120).optional(),type:z.enum(PERSON_TYPES),managerUserId:z.string().uuid().nullable().optional(),confirmMove:z.boolean().optional()});

// Everyone who could not submit a subscription today: no manager, not a manager, not the CEO.
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;
  const gaps=await query(`SELECT id,name,email FROM users u WHERE disabled_at IS NULL AND manager_user_id IS NULL
    AND NOT roles && ARRAY['ceo','manager']::text[] AND NOT EXISTS (SELECT 1 FROM users r WHERE r.manager_user_id=u.id AND r.disabled_at IS NULL) ORDER BY name`);
  return NextResponse.json({gaps:gaps.rows});}

// Add a person before their first sign-in. The role sits on the email, so their first Google
// sign-in links to this row and opens on the right home screen.
export async function POST(req:NextRequest){const limited=await rateLimit(req,"people");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  const {email,name,type,managerUserId,confirmMove}=addSchema.parse(await req.json());
  const domain=email.split("@")[1],{domains}=await getEmailDomains(),allowed=new Set([...domains,(process.env.GOOGLE_WORKSPACE_DOMAIN||"sankari-holding.com").toLowerCase()]);
  if(!allowed.has(domain))throw new AppError(`${domain} is not one of the company's Workspace domains`);
  const saved=await transaction(async c=>{
    if((await c.query(`SELECT 1 FROM users WHERE email=$1`,[email])).rowCount)throw new AppError("This person already exists. Change their type or manager in the table below.",409);
    if(managerUserId&&!(await c.query(`SELECT 1 FROM users WHERE id=$1 AND disabled_at IS NULL`,[managerUserId])).rowCount)throw new AppError("Manager not found",404);
    let moved:{id:string;email:string}|null=null;
    if(SINGLE_HOLDER.includes(type)){
      const holder=(await c.query<{id:string;email:string;roles:string[]}>(`SELECT id,email,roles FROM users WHERE $1=ANY(roles) AND disabled_at IS NULL FOR UPDATE`,[type])).rows[0];
      if(holder&&!confirmMove)return {needsConfirm:true,current:holder.email};
      if(holder){await c.query(`UPDATE users SET roles=array_remove(roles,$2) WHERE id=$1`,[holder.id,type]);moved={id:holder.id,email:holder.email};}
    }
    const r=await c.query(`INSERT INTO users(email,name,roles,manager_user_id,invited_by_user_id,invited_at) VALUES($1,$2,$3,$4,$5,now()) RETURNING id,email,name,roles,manager_user_id,invited_at`,[email,name||placeholderName(email),rolesForType(type),managerUserId??null,auth.user.id]);
    await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'user.invited',$2,$3,$4)`,[auth.user.id,JSON.stringify(moved?{movedRoleFrom:moved.email,role:type}:null),JSON.stringify(r.rows[0]),ipHash(req)]);
    return {user:r.rows[0],movedFrom:moved?.email??null};
  });
  if("needsConfirm" in saved)return NextResponse.json({error:`${saved.current} already holds this role. Confirm to move it.`,needsConfirm:true,current:saved.current},{status:409});
  return NextResponse.json(saved,{status:201});}catch(e){return jsonError(e);}}
