import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { createHash } from "node:crypto";
import { currentUser, hasRole } from "./auth";
import { AppError } from "./errors";
import type { Role, User } from "./types";

const limiter=new RateLimiterMemory({points:Number(process.env.RATE_LIMIT_POINTS||60),duration:Number(process.env.RATE_LIMIT_DURATION||60)});
export async function rateLimit(req:NextRequest,key="api"){
  const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||req.headers.get("x-real-ip")||"unknown";
  try{await limiter.consume(key+":"+ip);}catch{return NextResponse.json({error:"Too many requests"},{status:429,headers:{"Retry-After":"60"}});}return null;
}
export async function authorize(roles?:Role[]):Promise<{user:User;error:null}|{user:null;error:NextResponse}>{const user=await currentUser();if(!user)return {user:null,error:NextResponse.json({error:"Authentication required"},{status:401})};if(roles&&!hasRole(user,roles))return {user:null,error:NextResponse.json({error:"Forbidden"},{status:403})};return {user,error:null};}
export const jsonError=(error:unknown)=>{
  if(error instanceof AppError)return NextResponse.json({error:error.message},{status:error.status});
  // Database guard triggers (approval line, card data) raise check_violation with a value-free message.
  if((error as {code?:string})?.code==="23514")return NextResponse.json({error:(error as Error).message},{status:409});
  const message=error instanceof Error?error.message:"Unexpected error";const safe=/required|invalid|version|not found|forbidden|too long/i.test(message)?message:"Request could not be completed";return NextResponse.json({error:safe},{status:/not found/i.test(safe)?404:/forbidden/i.test(safe)?403:/version/i.test(safe)?409:400});};
export const ipHash=(req:NextRequest)=>createHash("sha256").update((req.headers.get("x-forwarded-for")||req.headers.get("x-real-ip")||"unknown")+(process.env.NEXTAUTH_SECRET||"")).digest("hex");
