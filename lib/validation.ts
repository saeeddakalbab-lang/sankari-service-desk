import { z } from "zod";
import { PRIORITIES, REQUEST_TYPES, ROLES, STATUS_BY_TYPE, type RequestType } from "./types";

const clean=(max:number)=>z.string().trim().min(1).max(max).transform(v=>v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,""));
export const createRequestSchema=z.object({
  type:z.enum(REQUEST_TYPES),department:clean(120),company:clean(120),subject:clean(200),description:clean(12000),priority:z.enum(PRIORITIES).default("medium"),
  details:z.record(z.string(),z.unknown()).default({})
}).superRefine((v,ctx)=>{
  const d=v.details as Record<string,unknown>;
  if(v.type==="subscription_approval"&&!String(d.service||"").trim())ctx.addIssue({code:"custom",path:["details","service"],message:"Service name is required"});
  if(v.type==="helpdesk_ticket"&&!String(d.category||"").trim())ctx.addIssue({code:"custom",path:["details","category"],message:"Category is required"});
  if(v.type==="email_account_request"&&!String(d.employeeName||"").trim())ctx.addIssue({code:"custom",path:["details","employeeName"],message:"Employee name is required"});
});
export const commentSchema=z.object({body:clean(8000),internal:z.boolean().default(false),version:z.number().int().positive()});
export const transitionSchema=z.object({status:z.string(),assigneeId:z.string().uuid().nullable().optional(),version:z.number().int().positive(),details:z.record(z.string(),z.unknown()).optional()});
export function assertStatus(type:RequestType,status:string){if(!STATUS_BY_TYPE[type].includes(status))throw new Error("Invalid status for request type");return status;}
export const roleUpdateSchema=z.object({roles:z.array(z.enum(ROLES)).min(1)});
