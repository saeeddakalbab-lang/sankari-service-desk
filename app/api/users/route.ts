import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { query,transaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { userUpdateSchema } from "@/lib/validation";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;const r=await query(`SELECT id,email,name,image,roles,manager_user_id,disabled_at,created_at FROM users ORDER BY name`);return NextResponse.json(r.rows);}
// Roles and reporting line. Changing a manager affects future requests only: submitted chains are frozen in approval_steps.
export async function PATCH(req:NextRequest){const limited=await rateLimit(req,"roles");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{const {id,roles,managerUserId}=userUpdateSchema.parse(await req.json());if(id===auth.user.id&&roles&&!roles.includes("admin"))throw new AppError("You cannot remove your own administrator role");
  const saved=await transaction(async c=>{const before=(await c.query(`SELECT id,email,name,roles,manager_user_id FROM users WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!before)throw new AppError("User not found",404);
    if(managerUserId){if(managerUserId===id)throw new AppError("A user cannot be their own manager");
      const cycle=await c.query(`WITH RECURSIVE up AS (SELECT id,manager_user_id,1 depth FROM users WHERE id=$1 UNION ALL SELECT u.id,u.manager_user_id,up.depth+1 FROM users u JOIN up ON u.id=up.manager_user_id WHERE up.depth<100) SELECT 1 FROM up WHERE id=$2`,[managerUserId,id]);
      if(cycle.rowCount)throw new AppError("That manager reports to this user; the reporting line would loop");
      if(!(await c.query(`SELECT 1 FROM users WHERE id=$1 AND disabled_at IS NULL`,[managerUserId])).rowCount)throw new AppError("Manager not found",404);}
    for(const single of ["ceo","owner"] as const)if(roles?.includes(single)&&(await c.query(`SELECT 1 FROM users WHERE $2=ANY(roles) AND disabled_at IS NULL AND id<>$1`,[id,single])).rowCount)throw new AppError(`Another active user already holds the ${single==="ceo"?"CEO":"Owner"} role`,409);
    const r=await c.query(`UPDATE users SET roles=coalesce($2,roles),manager_user_id=CASE WHEN $4 THEN $3::uuid ELSE manager_user_id END WHERE id=$1 RETURNING id,email,name,roles,manager_user_id`,[id,roles??null,managerUserId??null,managerUserId!==undefined]);
    await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'user.updated',$2,$3,$4)`,[auth.user.id,JSON.stringify(before),JSON.stringify(r.rows[0]),ipHash(req)]);return r.rows[0];});
  return NextResponse.json(saved);}catch(e){return jsonError(e);}}
