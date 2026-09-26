import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { markInvoicePaid,paidSchema } from "@/lib/contracts";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"contracts");if(limited)return limited;const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{const {id}=await params;return NextResponse.json(await markInvoicePaid(id,paidSchema.parse(await req.json()),auth.user,ipHash(req)));}catch(e){return jsonError(e);}}
