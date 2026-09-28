import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { queueReport } from "@/lib/reports";
export const dynamic="force-dynamic";
// Send a report now, for the last week or last month, to its saved recipients. Audited.
export async function POST(req:NextRequest){const limited=await rateLimit(req,"reports");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  const {kind,cadence}=z.object({kind:z.enum(["it","dev"]),cadence:z.enum(["weekly","monthly"])}).parse(await req.json());
  return NextResponse.json(await queueReport(kind,cadence,{byUserId:auth.user.id,ipHash:ipHash(req),manual:true}));}catch(e){return jsonError(e);}}
