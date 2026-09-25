import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { addAssignment,assignmentSchema } from "@/lib/contracts";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"contracts");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{const {id}=await params;return NextResponse.json(await addAssignment(id,assignmentSchema.parse(await req.json()),auth.user,ipHash(req)),{status:201});}catch(e){return jsonError(e);}}
