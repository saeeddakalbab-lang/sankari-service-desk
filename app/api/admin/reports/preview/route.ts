import { NextRequest,NextResponse } from "next/server";
import { authorize } from "@/lib/http";
import { buildReport,periodFor } from "@/lib/reports";
import { LOGO_CID } from "@/lib/email-layout";
export const dynamic="force-dynamic";
// The report email exactly as it will be sent, for the last week or month (the logo from the site).
export async function GET(req:NextRequest){const auth=await authorize(["admin"]);if(auth.error)return auth.error;
  const p=req.nextUrl.searchParams,kind=p.get("kind")==="dev"?"dev":"it",cadence=p.get("cadence")==="monthly"?"monthly":"weekly";
  const r=await buildReport(kind,periodFor(cadence));
  return new NextResponse(r.html.replace(`cid:${LOGO_CID}`,"/logo-white.png"),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});}
