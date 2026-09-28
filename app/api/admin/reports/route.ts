import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { getReportSettings,reportSettingsSchema,saveReportSettings } from "@/lib/reports";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;return NextResponse.json(await getReportSettings());}
// Who receives each report, from whom, and when; audited old -> new.
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"reports");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  return NextResponse.json(await saveReportSettings(reportSettingsSchema.parse(await req.json()),auth.user.id,ipHash(req)));}catch(e){return jsonError(e);}}
