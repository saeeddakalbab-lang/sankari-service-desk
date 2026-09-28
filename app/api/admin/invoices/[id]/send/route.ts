import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { sendInvoice } from "@/lib/contracts";
export const dynamic="force-dynamic";
// Email an issued, unpaid invoice to the client again, with its printable link. Audited.
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"invoices");if(limited)return limited;const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{const {id}=await params;if(!/^[0-9a-f-]{36}$/.test(id))return NextResponse.json({error:"Invoice not found"},{status:404});return NextResponse.json(await sendInvoice(id,auth.user,ipHash(req)));}catch(e){return jsonError(e);}}
