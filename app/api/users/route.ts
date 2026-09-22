import { NextRequest,NextResponse } from "next/server";
import { authorize,jsonError,rateLimit } from "@/lib/http";
import { query } from "@/lib/db";
import { roleUpdateSchema } from "@/lib/validation";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;const r=await query(`SELECT id,email,name,image,roles,disabled_at,created_at FROM users ORDER BY name`);return NextResponse.json(r.rows);}
export async function PATCH(req:NextRequest){const limited=await rateLimit(req,"roles");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{const body=await req.json(),{roles}=roleUpdateSchema.parse(body);if(body.id===auth.user.id&&!roles.includes("admin"))throw new Error("You cannot remove your own administrator role");const r=await query(`UPDATE users SET roles=$2 WHERE id=$1 RETURNING id,email,name,roles`,[body.id,roles]);return r.rows[0]?NextResponse.json(r.rows[0]):NextResponse.json({error:"User not found"},{status:404});}catch(e){return jsonError(e);}}
