import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { emailReceivables,receivablesEmailSchema } from "@/lib/receivables";
export const dynamic="force-dynamic";
// Email the outstanding receivables (one company, or all) to the accounting address, Excel attached. Audited.
export async function POST(req:NextRequest){const limited=await rateLimit(req,"receivables");if(limited)return limited;const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{
  const {company}=receivablesEmailSchema.parse(await req.json());return NextResponse.json(await emailReceivables(company||undefined,auth.user,ipHash(req)));}catch(e){return jsonError(e);}}
