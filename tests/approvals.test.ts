import { describe,expect,it } from "vitest";
import { resolveChain,needsApproval } from "../lib/approvals";
import { splitInstallments } from "../lib/money";

const p=(id:string)=>({id,name:id,email:`${id}@sankari-holding.com`});
const ids=(c:ReturnType<typeof resolveChain>)=>c.map(s=>`${s.approverRole}:${s.approverUserId}`);

describe("approval chain",()=>{
  it("employee goes to manager then CEO",()=>{expect(ids(resolveChain({requester:p("emp"),isCeo:false,isManager:false,manager:p("mgr"),ceo:p("ceo")}))).toEqual(["manager:mgr","ceo:ceo"]);});
  it("a manager goes straight to the CEO",()=>{expect(ids(resolveChain({requester:p("mgr"),isCeo:false,isManager:true,manager:p("other"),ceo:p("ceo")}))).toEqual(["ceo:ceo"]);});
  it("the CEO collapses to their manager only",()=>{expect(ids(resolveChain({requester:p("ceo"),isCeo:true,isManager:true,manager:p("chair"),ceo:p("ceo")}))).toEqual(["manager:chair"]);});
  it("an employee reporting directly to the CEO has one step",()=>{expect(ids(resolveChain({requester:p("emp"),isCeo:false,isManager:false,manager:p("ceo"),ceo:p("ceo")}))).toEqual(["ceo:ceo"]);});
  it("refuses instead of skipping a missing approver",()=>{
    expect(()=>resolveChain({requester:p("emp"),isCeo:false,isManager:false,manager:null,ceo:p("ceo")})).toThrow(/no manager/i);
    expect(()=>resolveChain({requester:p("emp"),isCeo:false,isManager:false,manager:p("mgr"),ceo:null})).toThrow(/no ceo/i);
    expect(()=>resolveChain({requester:p("ceo"),isCeo:true,isManager:false,manager:null,ceo:p("ceo")})).toThrow(/ceo's manager/i);
  });
  it("never lets the requester approve",()=>{expect(()=>resolveChain({requester:p("x"),isCeo:false,isManager:false,manager:p("x"),ceo:p("ceo")})).toThrow(/requester/i);});
  it("only subscriptions use the approval line",()=>{expect(needsApproval("helpdesk_ticket")).toBe(false);expect(needsApproval("email_account_request")).toBe(false);expect(needsApproval("subscription_approval")).toBe(true);});
});

describe("installment split",()=>{
  it("sums exactly to totals that do not divide evenly",()=>{
    for(const total of [0n,1n,2n,3n,7n,10001n,99999n,123456789n,9007199254740993n]){
      const s=splitInstallments(total,5000,2500);
      expect(s.firstCents+s.secondCents+s.finalCents).toBe(total);
      expect(s.finalCents>=s.secondCents).toBe(true);
    }
    expect(splitInstallments(10001n,5000,2500)).toEqual({firstCents:5000n,secondCents:2500n,finalCents:2501n});
  });
  it("rejects invalid shares",()=>{expect(()=>splitInstallments(100n,6000,5000)).toThrow();expect(()=>splitInstallments(100n,50.5,2500)).toThrow();expect(()=>splitInstallments(-1n,5000,2500)).toThrow();});
});

import { formatMoney,parseAmountToCents,usdToAedCents } from "../lib/money";
describe("AED conversion",()=>{
  it("converts exactly with the frozen rate",()=>{expect(usdToAedCents(36000n,"3.6725")).toBe(132210n);expect(usdToAedCents(19200n,"3.6725")).toBe(70512n);expect(usdToAedCents(1n,"3.6725")).toBe(4n);});
  it("formats and parses money without floats",()=>{expect(formatMoney(132210n,"AED")).toBe("AED 1,322.10");expect(parseAmountToCents("1,322.1")).toBe(132210n);expect(parseAmountToCents("1.005")).toBeNull();expect(parseAmountToCents("abc")).toBeNull();});
});
