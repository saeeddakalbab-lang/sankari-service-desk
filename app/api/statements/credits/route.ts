import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { addCredit,creditSchema } from "@/lib/statements";
export const dynamic="force-dynamic";
// A card payment or refund. Append-only: a mistake is corrected with another line, never an edit.
export async function POST(req:NextRequest){const limited=await rateLimit(req,"statements");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{return NextResponse.json(await addCredit(creditSchema.parse(await req.json()),auth.user.id,ipHash(req)),{status:201});}catch(e){return jsonError(e);}}
