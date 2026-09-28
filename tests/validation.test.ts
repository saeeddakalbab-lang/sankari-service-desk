import { describe,expect,it } from "vitest";
import { assertStatus,createRequestSchema,roleUpdateSchema } from "../lib/validation";

describe("request validation",()=>{
  it("requires type-specific fields",()=>{
    const result=createRequestSchema.safeParse({type:"helpdesk_ticket",department:"IT",company:"Sankari",subject:"Printer",description:"Printer is offline",priority:"medium",details:{}});
    expect(result.success).toBe(false);
  });
  it("accepts a complete request and strips control characters",()=>{
    const result=createRequestSchema.parse({type:"helpdesk_ticket",department:"IT",company:"Sankari",subject:"Printer\u0000",description:"Printer is offline",priority:"high",details:{category:"Hardware"}});
    expect(result.subject).toBe("Printer");
  });
  it("enforces workflow status and known roles",()=>{
    expect(assertStatus("email_account_request","provisioned")).toBe("provisioned");
    expect(()=>assertStatus("email_account_request","pending_finance")).toThrow();
    expect(roleUpdateSchema.safeParse({roles:["board","admin","accountant"]}).success).toBe(true);
    expect(roleUpdateSchema.safeParse({roles:["superuser"]}).success).toBe(false);expect(roleUpdateSchema.safeParse({roles:["owner"]}).success).toBe(true);
  });
});

describe("subscription request currency",()=>{
  const sub=(details:Record<string,unknown>)=>createRequestSchema.safeParse({type:"subscription_approval",department:"IT",company:"Sankari",subject:"Tool",description:"Needed for the team",priority:"medium",details:{service:"Tool",amountCents:9000,...details}});
  it("accepts AED without a rate, and USD with or without one",()=>{
    expect(sub({currency:"AED"}).success).toBe(true);
    expect(sub({currency:"USD"}).success).toBe(true);
    expect(sub({currency:"USD",aedRate:"3.6725"}).success).toBe(true);
  });
  it("accepts any other currency only with the requester's rate",()=>{
    expect(sub({currency:"CHF",aedRate:"4.62"}).success).toBe(true);
    expect(sub({currency:"CHF"}).success).toBe(false);
    expect(sub({currency:"CHF",aedRate:"0"}).success).toBe(false);
    expect(sub({currency:"chf",aedRate:"4.62"}).success).toBe(false);
  });
});
