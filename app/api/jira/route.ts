import { NextRequest,NextResponse } from "next/server";
import { authorize,rateLimit } from "@/lib/http";
import { getJiraIssues,getJiraOverview } from "@/lib/jira";
export const dynamic="force-dynamic";
// view=overview (default): progress per space and the team ranking over ?days=30|90|0 (0 = all time).
// view=mine: the signed-in person's own issues.
export async function GET(req:NextRequest){const limited=await rateLimit(req,"jira");if(limited)return limited;const auth=await authorize(["dev","admin"]);if(auth.error)return auth.error;
  const p=req.nextUrl.searchParams,view=p.get("view")??"overview",days=[30,90,0].includes(Number(p.get("days")))?Number(p.get("days")):30;
  try{return NextResponse.json(view==="mine"?await getJiraIssues(auth.user.email):await getJiraOverview(days));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Jira unavailable"},{status:503});}}
