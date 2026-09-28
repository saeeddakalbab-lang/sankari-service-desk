import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { transaction } from "@/lib/db";
import { getRules,rulesSchema } from "@/lib/rules";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;return NextResponse.json(await getRules());}
// SLA hours are copied onto each request at submission, so a change here affects new requests only.
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"rules");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  const next=rulesSchema.parse(await req.json());
  await transaction(async c=>{const before=(await c.query(`SELECT value FROM settings WHERE key='rules' FOR UPDATE`)).rows[0]?.value??null;
    await c.query(`INSERT INTO settings(key,value,updated_by) VALUES('rules',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by`,[JSON.stringify(next),auth.user.id]);
    await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'settings.rules',$2,$3,$4)`,[auth.user.id,JSON.stringify(before),JSON.stringify(next),ipHash(req)]);});
  return NextResponse.json(await getRules());}catch(e){return jsonError(e);}}
