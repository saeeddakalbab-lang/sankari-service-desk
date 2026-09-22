import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { createRequestSchema } from "@/lib/validation";
import { createRequest,listRequests } from "@/lib/requests";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){const auth=await authorize();if(auth.error)return auth.error;return NextResponse.json(await listRequests(auth.user,req.nextUrl.searchParams.get("scope")==="all"));}
export async function POST(req:NextRequest){const limited=await rateLimit(req,"submit");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;try{const input=createRequestSchema.parse(await req.json());return NextResponse.json(await createRequest(input,auth.user,ipHash(req)),{status:201});}catch(e){return jsonError(e);}}
