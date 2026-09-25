import { z } from "zod";
import { PRIORITIES, REQUEST_TYPES, ROLES, STATUS_BY_TYPE, type RequestType } from "./types";

const clean=(max:number)=>z.string().trim().min(1).max(max).transform(v=>v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,""));
export const createRequestSchema=z.object({
  type:z.enum(REQUEST_TYPES),department:clean(120),company:clean(120),subject:clean(200),description:clean(12000),priority:z.enum(PRIORITIES).default("medium"),
  details:z.record(z.string(),z.unknown()).default({})
}).superRefine((v,ctx)=>{
  const d=v.details as Record<string,unknown>;
  const issue=(field:string,message:string)=>ctx.addIssue({code:"custom",path:["details",field],message});
  // Card data is last-4 only. details is free-form JSON, so refuse anything that looks like a full card number anywhere in it.
  const texts=[v.subject,v.description,...Object.values(d).filter(x=>typeof x==="string") as string[]];
  if(texts.some(looksLikeCardNumber))ctx.addIssue({code:"custom",path:["details"],message:"Remove the card number: only the last 4 digits may be entered, in the card field"});
  if(v.type==="subscription_approval"){
    if(!String(d.service||"").trim())issue("service","Service name is required");
    if(d.cardLast4!==undefined&&d.cardLast4!==""&&!/^\d{4}$/.test(String(d.cardLast4)))issue("cardLast4","Enter only the last 4 digits of the card");
    if(d.amountCents!==undefined&&!(Number.isSafeInteger(d.amountCents)&&(d.amountCents as number)>=0))issue("amountCents","Amount is invalid");
    if(d.currency!==undefined&&!["USD","AED"].includes(String(d.currency)))issue("currency","Currency must be USD or AED");
  }
  if(v.type==="helpdesk_ticket"&&!String(d.category||"").trim())issue("category","Category is required");
  if(v.type==="email_account_request"){
    if(!String(d.employeeName||"").trim())issue("employeeName","Employee name is required");
    if(!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(String(d.emailLocal||"")))issue("emailLocal","Email name may use lower-case letters, digits, dots, dashes and underscores");
    if(!String(d.domain||"").trim())issue("domain","Choose the email domain");
  }
});
const CARD_RUN=/(?:\d[ -]?){13,19}/g;
// Luhn-valid runs of 13-19 digits: a real card number, not a phone number or reference.
export function looksLikeCardNumber(text:string){for(const m of text.match(CARD_RUN)||[]){const digits=m.replace(/\D/g,"");if(digits.length<13||digits.length>19)continue;let sum=0;for(let i=0;i<digits.length;i++){let n=+digits[digits.length-1-i];if(i%2){n*=2;if(n>9)n-=9;}sum+=n;}if(sum%10===0)return true;}return false;}
export const preferencesSchema=z.object({theme:z.enum(["light","dark","system"]).optional(),locale:z.enum(["en","ar"]).optional()}).refine(v=>v.theme||v.locale,{message:"Nothing to update"});
export const brandingSchema=z.object({accentHex:z.string().regex(/^#[0-9A-Fa-f]{6}$/,"Use a 6-digit hex colour such as #B84F27").optional(),defaultTheme:z.enum(["light","dark","system"]).optional()}).refine(v=>v.accentHex||v.defaultTheme,{message:"Nothing to update"});
const domainName=z.string().trim().toLowerCase().regex(/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,"Invalid domain name");
export const emailDomainsSchema=z.object({domains:z.array(domainName).min(1).max(50),default:domainName}).refine(v=>v.domains.includes(v.default),{message:"The default domain must be in the list"});
export const commentSchema=z.object({body:clean(8000),internal:z.boolean().default(false),version:z.number().int().positive()});
export const transitionSchema=z.object({status:z.string(),assigneeId:z.string().uuid().nullable().optional(),version:z.number().int().positive(),details:z.record(z.string(),z.unknown()).optional()});
export function assertStatus(type:RequestType,status:string){if(!STATUS_BY_TYPE[type].includes(status))throw new Error("Invalid status for request type");return status;}
export const roleUpdateSchema=z.object({roles:z.array(z.enum(ROLES)).min(1)});
export const approvalDecisionSchema=z.object({decision:z.enum(["approve","reject"]),comment:z.string().max(4000).default("").transform(v=>v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim())});
export const userUpdateSchema=z.object({id:z.string().uuid(),roles:z.array(z.enum(ROLES)).min(1).optional(),managerUserId:z.string().uuid().nullable().optional()}).refine(v=>v.roles!==undefined||v.managerUserId!==undefined,{message:"Nothing to update"});
