import { describe,expect,it } from "vitest";
import { accentPalette,checkAccent,contrast,ratioLabel } from "../lib/color";
import { createRequestSchema,looksLikeCardNumber } from "../lib/validation";

describe("brand colour contrast",()=>{
  it("matches known WCAG ratios",()=>{expect(ratioLabel(contrast("#000000","#FFFFFF"))).toBe("21.0");expect(ratioLabel(contrast("#FFFFFF","#FFFFFF"))).toBe("1.0");});
  it("accepts the terracotta and teal accents",()=>{expect(checkAccent("#B84F27").ok).toBe(true);expect(checkAccent("#1D5F70").ok).toBe(true);});
  it("refuses a light colour and says why",()=>{const r=checkAccent("#6FB7C8");expect(r.ok).toBe(false);expect(r.reason).toMatch(/2\.2:1|2\.3:1/);expect(r.reason).toMatch(/4\.5:1/);});
  it("never rounds a failing ratio up to 4.5",()=>{const r=checkAccent("#767676");expect(ratioLabel(r.ratio)).toBe("4.5");const f=checkAccent("#777777");expect(f.ok).toBe(false);expect(ratioLabel(f.ratio)).not.toBe("4.5");});
  it("refuses malformed input",()=>{expect(checkAccent("red").ok).toBe(false);expect(checkAccent("#FFF").ok).toBe(false);});
  it("derives a dark-mode accent that still reads on the dark surface",()=>{for(const hex of ["#B84F27","#1D5F70","#20744F","#2C5C8F","#000000"])expect(contrast(accentPalette(hex).dark,"#1E1A16")).toBeGreaterThanOrEqual(4.5);});
});

describe("card numbers never reach free text",()=>{
  it("detects Luhn-valid card numbers in any spacing",()=>{for(const t of ["4111111111111111","card 4111 1111 1111 1111 thanks","5500-0000-0000-0004"])expect(looksLikeCardNumber(t)).toBe(true);});
  it("ignores phone numbers and references",()=>{for(const t of ["+971 50 000 0000","SUB-2026-0142","call 0501234567","1234567890123"])expect(looksLikeCardNumber(t)).toBe(false);});
  it("rejects a request whose justification contains a card number",()=>{const r=createRequestSchema.safeParse({type:"subscription_approval",department:"IT",company:"Sankari Holding",subject:"Figma",description:"Pay with 4111 1111 1111 1111",priority:"medium",details:{service:"Figma"}});expect(r.success).toBe(false);});
  it("rejects more than 4 digits in the card field",()=>{const r=createRequestSchema.safeParse({type:"subscription_approval",department:"IT",company:"Sankari Holding",subject:"Figma",description:"Design seats",priority:"medium",details:{service:"Figma",cardLast4:"14471"}});expect(r.success).toBe(false);});
  it("requires a valid email name and a domain",()=>{const base={type:"email_account_request",department:"IT",company:"Sankari Holding",subject:"Mailbox",description:"New hire",priority:"medium"};
    expect(createRequestSchema.safeParse({...base,details:{employeeName:"Tariq Aziz",emailLocal:"tariq.aziz",domain:"sankari-holding.com"}}).success).toBe(true);
    expect(createRequestSchema.safeParse({...base,details:{employeeName:"Tariq Aziz",emailLocal:"Tariq Aziz",domain:"sankari-holding.com"}}).success).toBe(false);
    expect(createRequestSchema.safeParse({...base,details:{employeeName:"Tariq Aziz",emailLocal:"tariq.aziz"}}).success).toBe(false);});
});
