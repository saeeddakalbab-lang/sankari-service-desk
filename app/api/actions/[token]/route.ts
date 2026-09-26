import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { useLink } from "@/lib/actions";
export const dynamic="force-dynamic";
const bodySchema=z.object({reason:z.string().max(4000).optional().transform(v=>v?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim())});
// The only request that acts on an email link. It needs the recipient's own session; the link alone is not enough.
export async function POST(req:NextRequest,{params}:{params:Promise<{token:string}>}){const limited=await rateLimit(req,"action-link");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;try{const {token}=await params,{reason}=bodySchema.parse(await req.json().catch(()=>({})));return NextResponse.json(await useLink(token,auth.user,reason,ipHash(req)),{headers:{"Cache-Control":"no-store"}});}catch(e){return jsonError(e);}}
