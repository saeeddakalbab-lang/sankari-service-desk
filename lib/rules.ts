import { z } from "zod";
import { query } from "./db";
import { PRIORITIES,type Priority,type RequestType } from "./types";

// Request types an admin may put on the approval line. Helpdesk is never one of them:
// asking a manager to approve a broken VPN wastes both their time.
export const APPROVABLE_TYPES=["subscription_approval","email_account_request"] as const;
const hours=z.number().int().min(1).max(2160);
export const rulesSchema=z.object({
  slaHours:z.object({urgent:hours,high:hours,medium:hours,low:hours}),
  skipAfterHours:z.number().int().min(1).max(720),
  renewalLeadDays:z.number().int().min(1).max(180),
  approvalTypes:z.array(z.enum(APPROVABLE_TYPES)).max(2),
  notifications:z.object({toast:z.boolean(),emailAdminOnTicket:z.boolean(),emailApprover:z.boolean()}),
});
export type Rules=z.infer<typeof rulesSchema>;
export const DEFAULT_RULES:Rules={slaHours:{urgent:4,high:24,medium:72,low:120},skipAfterHours:48,renewalLeadDays:14,approvalTypes:["subscription_approval"],notifications:{toast:true,emailAdminOnTicket:true,emailApprover:true}};

// A missing or damaged record falls back to the defaults field by field, never to "no rules".
export async function getRules(db:{query:typeof query}={query}):Promise<Rules>{
  let raw:unknown={};
  try{raw=(await db.query<{value:unknown}>(`SELECT value FROM settings WHERE key='rules'`)).rows[0]?.value??{};}catch{}
  const r=raw as Partial<Rules>;
  const merged={...DEFAULT_RULES,...r,slaHours:{...DEFAULT_RULES.slaHours,...(r.slaHours||{})},notifications:{...DEFAULT_RULES.notifications,...(r.notifications||{})}};
  const parsed=rulesSchema.safeParse(merged);
  return parsed.success?parsed.data:DEFAULT_RULES;
}
export const slaHoursFor=(rules:Rules,p:Priority)=>rules.slaHours[PRIORITIES.includes(p)?p:"medium"];
export const needsApprovalUnder=(rules:Rules,type:RequestType)=>(rules.approvalTypes as readonly string[]).includes(type);
