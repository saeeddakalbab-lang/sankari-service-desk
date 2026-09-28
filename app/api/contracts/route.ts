import { NextRequest,NextResponse } from "next/server";
import { ipHash,jsonError,rateLimit } from "@/lib/http";
import { submitContractRequest } from "@/lib/contracts";
export const dynamic="force-dynamic";
// Public: prospective clients are not Workspace users. The server recomputes the price; a hidden
// "website" field catches form bots; the rate limit caps abuse.
export async function POST(req:NextRequest){const limited=await rateLimit(req,"contract-request");if(limited)return limited;try{return NextResponse.json(await submitContractRequest(await req.json(),ipHash(req)),{status:201});}catch(e){return jsonError(e);}}
