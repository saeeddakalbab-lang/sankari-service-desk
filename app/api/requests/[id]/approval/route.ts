import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { approvalDecisionSchema } from "@/lib/validation";
import { currentStep,decide,listSteps } from "@/lib/approvals";
import { getRequest } from "@/lib/requests";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"approval-read");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;const {id}=await params;const request=await getRequest(id,auth.user);if(!request)return NextResponse.json({error:"Request not found"},{status:404});const steps=await listSteps(id);return NextResponse.json({approvalRequired:request.approval_required,status:request.status,steps,currentStepId:currentStep(steps)?.id??null});}
// The only way to approve or reject. Every rule is re-checked server-side against the stored chain.
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"approval");if(limited)return limited;const auth=await authorize();if(auth.error)return auth.error;try{const {id}=await params,{decision,comment}=approvalDecisionSchema.parse(await req.json());return NextResponse.json(await decide(id,decision,comment,auth.user,ipHash(req)));}catch(e){return jsonError(e);}}
