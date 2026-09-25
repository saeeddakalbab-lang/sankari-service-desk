import { NextRequest,NextResponse } from "next/server";
import { authorize,jsonError,rateLimit } from "@/lib/http";
import { approvalsEnabled,buildChain } from "@/lib/approvals";
import { getRules,needsApprovalUnder } from "@/lib/rules";
import { pool } from "@/lib/db";
import { REQUEST_TYPES,type RequestType } from "@/lib/types";
export const dynamic="force-dynamic";
// "Who approves this" - the actual people in the signed-in user's chain, before they submit.
export async function GET(req:NextRequest){const limited=await rateLimit(req,"chain");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;const type=req.nextUrl.searchParams.get("type") as RequestType;if(!REQUEST_TYPES.includes(type))return NextResponse.json({error:"Invalid request type"},{status:400});
  if(!needsApprovalUnder(await getRules(),type)||!await approvalsEnabled())return NextResponse.json({approvalRequired:false,steps:[]});
  try{const chain=await buildChain(pool,auth.user.id);return NextResponse.json({approvalRequired:true,steps:chain.map(({approverUserId,approverName,approverRole})=>({approverUserId,approverName,approverRole}))});}catch(e){return jsonError(e);}}
