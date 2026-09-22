import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { transitionSchema } from "@/lib/validation";
import { transitionRequest } from "@/lib/requests";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"transition");if(limited)return limited;const auth=await authorize(["agent","admin"]);if(auth.error)return auth.error;try{const {id}=await params;return NextResponse.json(await transitionRequest(id,transitionSchema.parse(await req.json()),auth.user,ipHash(req)));}catch(e){return jsonError(e);}}
