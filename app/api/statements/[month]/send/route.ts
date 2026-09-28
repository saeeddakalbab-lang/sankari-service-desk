import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { monthRe,sendStatement } from "@/lib/statements";
export const dynamic="force-dynamic";
// The only way the statement leaves the portal: an admin presses Send.
export async function POST(req:NextRequest,{params}:{params:Promise<{month:string}>}){const limited=await rateLimit(req,"statements");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{const {month}=await params;if(!monthRe.test(month))throw new AppError("Month must look like 2026-09");return NextResponse.json(await sendStatement(month,auth.user.id,ipHash(req)));}catch(e){return jsonError(e);}}
