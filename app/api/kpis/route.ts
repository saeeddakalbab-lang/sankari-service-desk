import { NextRequest,NextResponse } from "next/server";
import { authorize,rateLimit } from "@/lib/http";
import { getKpis } from "@/lib/kpi";
import { OVERSIGHT_ROLES } from "@/lib/types";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){const limited=await rateLimit(req,"kpi");if(limited)return limited;const auth=await authorize([...OVERSIGHT_ROLES]);if(auth.error)return auth.error;const days=Math.min(365,Math.max(30,Number(req.nextUrl.searchParams.get("days")||90)));return NextResponse.json(await getKpis(days));}
