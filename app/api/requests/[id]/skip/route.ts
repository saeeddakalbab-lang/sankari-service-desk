import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { skipStep } from "@/lib/approvals";
const bodySchema=z.object({reason:z.string().max(4000).default("").transform(v=>v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim())});
// Any signed-in user may call this; skipStep and the database decide whether this person may skip.
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"skip");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;try{const {id}=await params,{reason}=bodySchema.parse(await req.json());return NextResponse.json(await skipStep(id,reason,auth.user,ipHash(req)));}catch(e){return jsonError(e);}}
