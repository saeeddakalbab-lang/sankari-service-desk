import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { payPayable } from "@/lib/ledger";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"ledger");if(limited)return limited;const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{const {id}=await params,{paidOn}=z.object({paidOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(await req.json());return NextResponse.json(await payPayable(id,paidOn,auth.user,ipHash(req)));}catch(e){return jsonError(e);}}
