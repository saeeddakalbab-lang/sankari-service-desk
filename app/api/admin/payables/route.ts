import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { addPayable,payableSchema } from "@/lib/ledger";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){const limited=await rateLimit(req,"ledger");if(limited)return limited;const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{return NextResponse.json(await addPayable(payableSchema.parse(await req.json()),auth.user,ipHash(req)),{status:201});}catch(e){return jsonError(e);}}
