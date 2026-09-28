import { NextRequest,NextResponse } from "next/server";
import { authorize } from "@/lib/http";
import { buildReport,periodFor } from "@/lib/reports";
export const dynamic="force-dynamic";
// The report's Excel file (every task in the period) without sending anything.
export async function GET(req:NextRequest){const auth=await authorize(["admin"]);if(auth.error)return auth.error;
  const p=req.nextUrl.searchParams,kind=p.get("kind")==="dev"?"dev":"it",cadence=p.get("cadence")==="monthly"?"monthly":"weekly";
  const r=await buildReport(kind,periodFor(cadence));
  return new NextResponse(new Uint8Array(r.file),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="${r.filename}"`,"Cache-Control":"no-store"}});}
