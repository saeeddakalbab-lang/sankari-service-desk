import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { transaction } from "@/lib/db";
import { getEmailDomains } from "@/lib/settings";
import { emailDomainsSchema } from "@/lib/validation";
export const dynamic="force-dynamic";
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"domains");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{const parsed=emailDomainsSchema.parse(await req.json()),value={domains:[...new Set(parsed.domains)],default:parsed.default};
  await transaction(async c=>{const before=(await c.query(`SELECT value FROM settings WHERE key='email_domains' FOR UPDATE`)).rows[0]?.value??null;
    await c.query(`INSERT INTO settings(key,value,updated_by) VALUES('email_domains',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by`,[JSON.stringify(value),auth.user.id]);
    await c.query(`INSERT INTO audit_log(actor_id,action,before_data,after_data,ip_hash) VALUES($1,'settings.email_domains',$2,$3,$4)`,[auth.user.id,JSON.stringify(before),JSON.stringify(value),ipHash(req)]);});
  return NextResponse.json(await getEmailDomains());}catch(e){return jsonError(e);}}
