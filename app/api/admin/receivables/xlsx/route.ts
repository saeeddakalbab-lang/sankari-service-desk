import { NextRequest,NextResponse } from "next/server";
import { authorize,rateLimit } from "@/lib/http";
import { listReceivables,receivablesFilename,receivablesXlsx } from "@/lib/receivables";
export const dynamic="force-dynamic";
// Outstanding receivables as Excel, for one company (?company=) or all of them. Finance only.
export async function GET(req:NextRequest){const limited=await rateLimit(req,"receivables");if(limited)return limited;const auth=await authorize(["admin","accountant"]);if(auth.error)return auth.error;
  const company=req.nextUrl.searchParams.get("company")?.trim().slice(0,160)||undefined,file=receivablesXlsx(await listReceivables(company));
  return new NextResponse(new Uint8Array(file),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="receivables.xlsx"; filename*=UTF-8''${encodeURIComponent(receivablesFilename(company))}`,"Cache-Control":"no-store"}});}
