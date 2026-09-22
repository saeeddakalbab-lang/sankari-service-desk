import { NextRequest,NextResponse } from "next/server";
import { authorize,rateLimit } from "@/lib/http";
import { getJiraIssues } from "@/lib/jira";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){const limited=await rateLimit(req,"jira");if(limited)return limited;const auth=await authorize(["dev","admin"]);if(auth.error)return auth.error;const mine=req.nextUrl.searchParams.get("view")==="mine";try{return NextResponse.json(await getJiraIssues(mine?auth.user.email:undefined));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Jira unavailable"},{status:503});}}
