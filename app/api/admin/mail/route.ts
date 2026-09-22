import { NextResponse } from "next/server";
import { authorize } from "@/lib/http";
import { query } from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(){const auth=await authorize(["admin"]);if(auth.error)return auth.error;const r=await query(`SELECT state,count(*)::int count,max(created_at) latest FROM email_outbox GROUP BY state ORDER BY state`);return NextResponse.json({configured:!!process.env.SMTP_HOST,rows:r.rows});}
