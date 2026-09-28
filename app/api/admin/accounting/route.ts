import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { transaction } from "@/lib/db";
import { accountingSchema,getAccounting } from "@/lib/statements";
import { AppError } from "@/lib/errors";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;return NextResponse.json(await getAccounting());}
// The accounting address and the carried-forward opening balance; every change is audited old -> new.
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"accounting");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  const next=accountingSchema.parse(await req.json());
  await transaction(async c=>{const before=(await c.query(`SELECT value FROM settings WHERE key='accounting' FOR UPDATE`)).rows[0]?.value??null;
    // Moving the cycle day after a statement went out would make periods overlap or leave a gap.
    if(next.cycleDay!==(before?.cycleDay??1)&&(await c.query(`SELECT 1 FROM monthly_statements WHERE sent_at IS NOT NULL LIMIT 1`)).rowCount)throw new AppError("The cycle day cannot change after a statement has been sent to accounting",409);
    await c.query(`INSERT INTO settings(key,value,updated_by) VALUES('accounting',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by`,[JSON.stringify(next),auth.user.id]);
    await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'settings.accounting',$2,$3,$4)`,[auth.user.id,JSON.stringify(before),JSON.stringify(next),ipHash(req)]);});
  return NextResponse.json(await getAccounting());}catch(e){return jsonError(e);}}
