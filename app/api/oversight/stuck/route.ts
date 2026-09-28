import { NextRequest,NextResponse } from "next/server";
import { authorize,rateLimit } from "@/lib/http";
import { listStuck } from "@/lib/oversight";
import { OVERSIGHT_ROLES } from "@/lib/types";
export const dynamic="force-dynamic";
// Read-only for everyone, Board included. Approving happens only on /api/requests/[id]/approval.
export async function GET(req:NextRequest){const limited=await rateLimit(req,"stuck");if(limited)return limited;const auth=await authorize([...OVERSIGHT_ROLES]);if(auth.error)return auth.error;return NextResponse.json(await listStuck());}
