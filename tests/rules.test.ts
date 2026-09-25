import { describe,expect,it } from "vitest";
import { DEFAULT_RULES,needsApprovalUnder,rulesSchema,slaHoursFor } from "../lib/rules";

describe("rules",()=>{
  it("defaults match today's behaviour",()=>{expect(DEFAULT_RULES.slaHours).toEqual({urgent:4,high:24,medium:72,low:120});expect(DEFAULT_RULES.skipAfterHours).toBe(48);expect(DEFAULT_RULES.renewalLeadDays).toBe(14);expect(needsApprovalUnder(DEFAULT_RULES,"subscription_approval")).toBe(true);expect(needsApprovalUnder(DEFAULT_RULES,"email_account_request")).toBe(false);expect(needsApprovalUnder(DEFAULT_RULES,"helpdesk_ticket")).toBe(false);});
  it("uses the configured SLA hours",()=>{expect(slaHoursFor({...DEFAULT_RULES,slaHours:{...DEFAULT_RULES.slaHours,high:8}},"high")).toBe(8);});
  it("refuses zero, fractional or absurd values",()=>{for(const bad of [{...DEFAULT_RULES,skipAfterHours:0},{...DEFAULT_RULES,renewalLeadDays:2.5},{...DEFAULT_RULES,slaHours:{...DEFAULT_RULES.slaHours,low:99999}}])expect(rulesSchema.safeParse(bad).success).toBe(false);});
  it("never lets helpdesk onto the approval line",()=>{expect(rulesSchema.safeParse({...DEFAULT_RULES,approvalTypes:["helpdesk_ticket"]}).success).toBe(false);});
});
