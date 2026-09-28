import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { getContractParty,partySchema,saveContractParty } from "@/lib/contracts";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;return NextResponse.json(await getContractParty());}
// Sankari's details on every contract (first party) and invoice (issuer); audited old -> new.
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"settings");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  return NextResponse.json(await saveContractParty(partySchema.parse(await req.json()),auth.user.id,ipHash(req)));}catch(e){return jsonError(e);}}
