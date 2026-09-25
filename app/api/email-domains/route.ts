import { NextResponse } from "next/server";
import { authorize } from "@/lib/http";
import { getEmailDomains } from "@/lib/settings";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize();if(auth.error)return auth.error;return NextResponse.json(await getEmailDomains());}
