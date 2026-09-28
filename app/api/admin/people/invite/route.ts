import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,ipHash,jsonError,rateLimit } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { queueInvitation } from "@/lib/invite-send";
export const dynamic="force-dynamic";
// Send the invitation again to someone who has not signed in yet. Admins only; audited.
export async function POST(req:NextRequest){const limited=await rateLimit(req,"people");if(limited)return limited;const auth=await authorize(["admin"]);if(auth.error)return auth.error;try{
  const {id}=z.object({id:z.string().uuid()}).parse(await req.json()),r=await queueInvitation(id,auth.user,ipHash(req));
  if(!r.sent)throw new AppError(r.reason==="already signed in"?"This person has already signed in":"Person not found",r.reason==="already signed in"?409:404);
  return NextResponse.json(r);}catch(e){return jsonError(e);}}
