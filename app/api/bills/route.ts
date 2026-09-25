import { NextRequest,NextResponse } from "next/server";
import { authorize,jsonError } from "@/lib/http";
import { billFilterSchema,listBills } from "@/lib/subscriptions";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;try{return NextResponse.json(await listBills(auth.user,billFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams))));}catch(e){return jsonError(e);}}
