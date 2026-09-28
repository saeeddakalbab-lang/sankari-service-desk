import { NextRequest,NextResponse } from "next/server";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { deleteLine,editLine,lineDeleteSchema,lineEditSchema } from "@/lib/statements";
export const dynamic="force-dynamic";
// Correct or delete one statement line before its statement is sent; audited (a delete keeps the whole row).
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"statements");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"Not found"},{status:404});
  return NextResponse.json(await editLine(id,lineEditSchema.parse(await req.json()),auth.user.id,ipHash(req)));}catch(e){return jsonError(e);}}
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){const limited=await rateLimit(req,"statements");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"Not found"},{status:404});
  return NextResponse.json(await deleteLine(id,lineDeleteSchema.parse(await req.json()),auth.user.id,ipHash(req)));}catch(e){return jsonError(e);}}
