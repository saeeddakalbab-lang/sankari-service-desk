import { NextRequest,NextResponse } from "next/server";
import { authorize,rateLimit } from "@/lib/http";
import { listPendingFor } from "@/lib/approvals";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){const limited=await rateLimit(req,"approvals");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;return NextResponse.json(await listPendingFor(auth.user));}
