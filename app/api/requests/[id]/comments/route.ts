import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { commentSchema } from "@/lib/validation";
import { addComment } from "@/lib/requests";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"comment");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;try{const {id}=await params,{body,internal,version}=commentSchema.parse(await req.json());return NextResponse.json(await addComment(id,body,internal,version,auth.user,ipHash(req)),{status:201});}catch(e){return jsonError(e);}}
