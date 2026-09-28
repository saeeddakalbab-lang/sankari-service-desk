import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError } from "@/lib/http";
import { query } from "@/lib/db";
import { billFilterSchema,billsCsv,listBills } from "@/lib/subscriptions";
export const dynamic="force-dynamic";
// Same filters as the bill history screen. Every export is audited: it is company spending leaving the portal.
export async function GET(req:NextRequest){const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{
  const f=billFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams)),{rows}=await listBills(auth.user,f);
  await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'bills.exported',$2,$3)`,[auth.user.id,JSON.stringify({...f,rows:rows.length}),ipHash(req)]);
  const name=`sankari-bills${f.company?"-"+f.company.replace(/[^A-Za-z0-9]+/g,"-"):""}${f.from?"-from-"+f.from:""}${f.to?"-to-"+f.to:""}.csv`;
  return new NextResponse(billsCsv(rows),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${name}"`,"Cache-Control":"no-store"}});
}catch(e){return jsonError(e);}}
