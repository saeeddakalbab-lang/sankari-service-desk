import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { teamAction,teamActionSchema,teamState } from "@/lib/team";
export const dynamic="force-dynamic";
// My manager and my team. Naming each other links them; one side alone changes nothing (lib/team.ts).
export async function GET(){const auth=await authorize();if(auth.error)return auth.error;return NextResponse.json(await teamState(auth.user.id));}
export async function POST(req:NextRequest){const limited=await rateLimit(req,"team");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;try{
  const r=await teamAction(auth.user,teamActionSchema.parse(await req.json()),ipHash(req));return NextResponse.json({...r,state:await teamState(auth.user.id)});}catch(e){return jsonError(e);}}
