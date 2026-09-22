import { NextResponse } from "next/server";
import { query } from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(){try{await query("SELECT 1");return NextResponse.json({ok:true,service:"sankari-unified-platform",time:new Date().toISOString()});}catch{return NextResponse.json({ok:false},{status:503});}}
