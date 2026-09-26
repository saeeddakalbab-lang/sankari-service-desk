import { NextResponse } from "next/server";
import { authorize,jsonError } from "@/lib/http";
import { query } from "@/lib/db";
import { ledgerCsv,ledgerOverview } from "@/lib/ledger";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{const {lines}=await ledgerOverview(auth.user,36);
  await query(`INSERT INTO audit_log(actor_id,action,after_data) VALUES($1,'ledger.exported',$2)`,[auth.user.id,JSON.stringify({rows:lines.length})]);
  return new NextResponse(ledgerCsv(lines),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="sankari-ledger.csv"`,"Cache-Control":"no-store"}});}catch(e){return jsonError(e);}}
