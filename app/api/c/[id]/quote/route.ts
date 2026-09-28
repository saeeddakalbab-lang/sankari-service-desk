import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { ipHash,jsonError,rateLimit } from "@/lib/http";
import { clientQuoteDecision,quoteDecisionSchema } from "@/lib/contracts";
import { validContractKey } from "@/lib/contract-link";
export const dynamic="force-dynamic";
// Public: the client accepts or declines their quotation. The key from the emailed link is the only
// credential; a wrong key is a plain 404. A POST, never a GET, changes anything.
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"quote-decision");if(limited)return limited;try{
  const {id}=await params,body=await req.json(),{k}=z.object({k:z.string().max(64)}).parse(body);
  if(!validContractKey(id,k))return NextResponse.json({error:"Not found"},{status:404});
  return NextResponse.json(await clientQuoteDecision(id,quoteDecisionSchema.parse(body),ipHash(req)));}catch(e){return jsonError(e);}}
