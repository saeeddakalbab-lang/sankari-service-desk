import { NextRequest,NextResponse } from "next/server";
import { authorize } from "@/lib/http";
import { getRequest,listComments } from "@/lib/requests";
export const dynamic="force-dynamic";
export async function GET(_:NextRequest,{params}:{params:Promise<{id:string}>}){const auth=await authorize();if(auth.error)return auth.error;const {id}=await params;const [request,comments]=await Promise.all([getRequest(id,auth.user),listComments(id,auth.user)]);return request?NextResponse.json({request,comments}):NextResponse.json({error:"Request not found"},{status:404});}
