import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, midpointMonths, quote } from "../lib/pricing";

describe("contract pricing", () => {
  it("matches the plan's worked example: DevOps, 80 h/month, 6 months = $18,000", () => {
    const q = quote(DEFAULT_PRICING, { lines: [{ service: "devops", hoursPerMonth: 80 }], durationMonths: 6, supportType: "remote" });
    expect(q.lines[0].monthlyFullTimeCents).toBe(600000n);   // (1,000 + 1,000) x 3 = $6,000
    expect(q.lines[0].monthlyPriceCents).toBe(300000n);      // $37.50 x 80
    expect(q.totalCents).toBe(1800000n);
  });
  it("prices the consultant at $10,500 full-time", () => {
    expect(quote(DEFAULT_PRICING, { lines: [{ service: "consultant", hoursPerMonth: 160 }], durationMonths: 1, supportType: "remote" }).totalCents).toBe(1050000n);
  });
  it("sums several services as line items", () => {
    const q = quote(DEFAULT_PRICING, { lines: [{ service: "consultant", hoursPerMonth: 40 }, { service: "devops", hoursPerMonth: 80 }], durationMonths: 3, supportType: "remote" });
    expect(q.subtotalCents).toBe((262500n + 300000n) * 3n);
  });
  it("rounds an odd hour count half-up to the cent", () => {
    const q = quote(DEFAULT_PRICING, { lines: [{ service: "it_support", hoursPerMonth: 7 }], durationMonths: 1, supportType: "remote" });
    expect(q.lines[0].monthlyPriceCents).toBe(26250n);       // 600000 x 7 / 160 = 26250 exactly
    const odd = quote({ ...DEFAULT_PRICING, standardHours: 170 }, { lines: [{ service: "it_support", hoursPerMonth: 1 }], durationMonths: 1, supportType: "remote" });
    expect(odd.lines[0].monthlyPriceCents).toBe(3529n);      // 3529.41 -> 3529
  });
  it("applies the onsite premium only onsite", () => {
    const cfg = { ...DEFAULT_PRICING, onsitePremiumBps: 1000 };
    expect(quote(cfg, { lines: [{ service: "devops", hoursPerMonth: 80 }], durationMonths: 6, supportType: "onsite" }).onsitePremiumCents).toBe(180000n);
    expect(quote(cfg, { lines: [{ service: "devops", hoursPerMonth: 80 }], durationMonths: 6, supportType: "remote" }).onsitePremiumCents).toBe(0n);
  });
  it("refuses unknown and duplicated services", () => {
    expect(() => quote(DEFAULT_PRICING, { lines: [{ service: "astrology", hoursPerMonth: 1 }], durationMonths: 1, supportType: "remote" })).toThrow();
    expect(() => quote(DEFAULT_PRICING, { lines: [{ service: "devops", hoursPerMonth: 1 }, { service: "devops", hoursPerMonth: 2 }], durationMonths: 1, supportType: "remote" })).toThrow();
  });
  it("puts the midpoint at half the contract, rounded to the nearest month", () => {
    expect([1, 2, 5, 6, 12].map(midpointMonths)).toEqual([1, 1, 3, 3, 6]);
  });
});
