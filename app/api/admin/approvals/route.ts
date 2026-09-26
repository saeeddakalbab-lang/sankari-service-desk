import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { approvalsEnabled } from "@/lib/approvals";
import { query,transaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { z } from "zod";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;const [ceo,unmanaged]=await Promise.all([query(`SELECT id,name,email FROM users WHERE 'ceo'=ANY(roles) AND disabled_at IS NULL`),query<{count:number}>(`SELECT count(*)::int count FROM users WHERE disabled_at IS NULL AND manager_user_id IS NULL AND NOT 'ceo'=ANY(roles) AND NOT EXISTS(SELECT 1 FROM users r WHERE r.manager_user_id=users.id AND r.disabled_at IS NULL)`)]);return NextResponse.json({enabled:await approvalsEnabled(),ceo:ceo.rows[0]??null,usersWithoutApprover:unmanaged.rows[0].count});}
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"admin-approvals");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{const {enabled}=z.object({enabled:z.boolean()}).parse(await req.json());
  await transaction(async c=>{if(enabled&&!(await c.query(`SELECT 1 FROM users WHERE 'ceo'=ANY(roles) AND disabled_at IS NULL`)).rowCount)throw new AppError("Assign the CEO role before turning on the approval line");const before=(await c.query(`SELECT value FROM settings WHERE key='approvals'`)).rows[0]?.value??null;await c.query(`INSERT INTO settings(key,value,updated_by) VALUES('approvals',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by`,[JSON.stringify({enabled}),auth.user.id]);await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'settings.approvals',$2,$3,$4)`,[auth.user.id,JSON.stringify(before),JSON.stringify({enabled}),ipHash(req)]);});
  return NextResponse.json({enabled});}catch(e){return jsonError(e);}}
