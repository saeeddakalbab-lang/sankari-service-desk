import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { getPricing,pricingEditSchema,savePricing } from "@/lib/contracts";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;return NextResponse.json(await getPricing());}
// The contract price list; every change is audited old -> new and applies to new requests only.
export async function PUT(req:NextRequest){const limited=await rateLimit(req,"pricing");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  return NextResponse.json(await savePricing(pricingEditSchema.parse(await req.json()),auth.user.id,ipHash(req)));}catch(e){return jsonError(e);}}
