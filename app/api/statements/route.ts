import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,jsonError,rateLimit } from "@/lib/http";
import { buildStatement,generateStatement,monthRe } from "@/lib/statements";
export const dynamic="force-dynamic";
const monthSchema=z.string().regex(monthRe,"Month must look like 2026-09");
export async function GET(req:NextRequest){const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{return NextResponse.json(await buildStatement(monthSchema.parse(req.nextUrl.searchParams.get("month")||"")));}catch(e){return jsonError(e);}}
// Prepares (or refreshes, while unsent) the statement and its held email. Sending is a separate action.
export async function POST(req:NextRequest){const limited=await rateLimit(req,"statements");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{const {month}=z.object({month:monthSchema}).parse(await req.json());return NextResponse.json(await generateStatement(month,auth.user.id));}catch(e){return jsonError(e);}}
