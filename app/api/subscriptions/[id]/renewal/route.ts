import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { decideRenewal } from "@/lib/subscriptions";
const bodySchema=z.object({decision:z.enum(["renew","decline"]),note:z.string().max(2000).default("").transform(v=>v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim())});
// Any signed-in user may call this; decideRenewal and the database allow only the subscription's owner.
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"renewal");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;try{const {id}=await params,{decision,note}=bodySchema.parse(await req.json());return NextResponse.json(await decideRenewal(id,decision,note,auth.user,ipHash(req)));}catch(e){return jsonError(e);}}
