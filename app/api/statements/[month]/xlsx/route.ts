import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError } from "@/lib/http";
import { query } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { buildStatement,monthRe,statementXlsx } from "@/lib/statements";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest,{params}:{params:Promise<{month:string}>}){const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{
  const {month}=await params;if(!monthRe.test(month))throw new AppError("Month must look like 2026-09");
  const file=statementXlsx(await buildStatement(month));
  await query(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,'statement.exported',$2,$3)`,[auth.user.id,JSON.stringify({month,format:"xlsx"}),ipHash(req)]);
  return new NextResponse(new Uint8Array(file),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="sankari-subscriptions-statement-${month}.xlsx"`,"Cache-Control":"no-store"}});
}catch(e){return jsonError(e);}}
