import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { createFromRequest,createSchema,listSubscriptions } from "@/lib/subscriptions";
export const dynamic="force-dynamic";
// Owners see their own subscriptions; admins see all and record new ones from approved requests.
export async function GET(){const auth=await authorize();if(auth.error)return auth.error;try{return NextResponse.json(await listSubscriptions(auth.user));}catch(e){return jsonError(e);}}
export async function POST(req:NextRequest){const limited=await rateLimit(req,"subscriptions");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{return NextResponse.json(await createFromRequest(createSchema.parse(await req.json()),auth.user,ipHash(req)),{status:201});}catch(e){return jsonError(e);}}
