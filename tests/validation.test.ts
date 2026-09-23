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
    expect(()=>assertStatus("email_account_request","approved")).toThrow();
    expect(roleUpdateSchema.safeParse({roles:["board","admin","accountant"]}).success).toBe(true);
    expect(roleUpdateSchema.safeParse({roles:["owner"]}).success).toBe(false);
  });
});
