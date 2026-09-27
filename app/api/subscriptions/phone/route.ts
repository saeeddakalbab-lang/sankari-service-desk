import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { phoneSchema,recordPhoneApproval } from "@/lib/subscriptions";
export const dynamic="force-dynamic";
// A new subscription or a renewal approved on a phone call, with who approved it and the actual cost.
export async function POST(req:NextRequest){const limited=await rateLimit(req,"subscriptions");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{return NextResponse.json(await recordPhoneApproval(phoneSchema.parse(await req.json()),auth.user,ipHash(req)),{status:201});}catch(e){return jsonError(e);}}
