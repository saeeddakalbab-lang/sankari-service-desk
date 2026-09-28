import { NextRequest,NextResponse } from "next/server";
import { authorize,jsonError } from "@/lib/http";
import { newTicketsSince } from "@/lib/actions";
import { getRules } from "@/lib/rules";
export const dynamic="force-dynamic";
// Polled every 20s by the corner toast. With no "after", it only returns the server clock to start from,
// so opening the portal never replays old tickets.
export async function GET(req:NextRequest){const auth=await authorize(["agent","admin"]);if(auth.error)return auth.error;try{
  const now=new Date(),rules=await getRules(),raw=req.nextUrl.searchParams.get("after"),after=raw?new Date(raw):null;
  if(!rules.notifications.toast)return NextResponse.json({now,enabled:false,items:[]});
  if(!after||isNaN(after.getTime()))return NextResponse.json({now,enabled:true,items:[]});
  // 30s overlap: a ticket whose transaction began before the last poll still shows; the client drops repeats by id.
  const floor=new Date(now.getTime()-24*3600e3),from=new Date(after.getTime()-30e3);
  return NextResponse.json({now,enabled:true,items:await newTicketsSince(auth.user,from<floor?floor:from)},{headers:{"Cache-Control":"no-store"}});
}catch(e){return jsonError(e);}}
