import { describe, expect, it } from "vitest";
import { adjustContract, DEFAULT_PRICING, midpointMonths, percentToBps, quote, withWorkPattern, workload } from "../lib/pricing";

const line = (service: string, weeksPerMonth: number, daysPerWeek = 6) => ({ service, weeksPerMonth, daysPerWeek });

describe("contract pricing", () => {
  it("counts a full month as 4 weeks x 6 days x 8 hours = 192 hours", () => {
    expect(withWorkPattern(DEFAULT_PRICING).standardHours).toBe(192);
    // An older stored setting with 160 hours cannot disagree with the working pattern.
    expect(withWorkPattern({ ...DEFAULT_PRICING, standardHours: 160 }).standardHours).toBe(192);
  });
  it("prices the consultant at $10,500 for a full month", () => {
    expect(quote(DEFAULT_PRICING, { lines: [line("consultant", 4)], durationMonths: 1, supportType: "remote" }).totalCents).toBe(1050000n);
  });
  it("charges half when the consultant is in the mall two weeks of each month", () => {
    const q = quote(DEFAULT_PRICING, { lines: [line("consultant", 2)], durationMonths: 6, supportType: "onsite" });
    expect(q.lines[0].hoursPerMonth).toBe(96);
    expect(q.lines[0].monthlyPriceCents).toBe(525000n);      // $5,250 a month
    expect(q.totalCents).toBe(3150000n);                      // $31,500 for six months, not $63,000
  });
  it("keeps the DevOps example: half a month for 6 months = $18,000", () => {
    const q = quote(DEFAULT_PRICING, { lines: [line("devops", 2)], durationMonths: 6, supportType: "remote" });
    expect(q.lines[0].monthlyFullTimeCents).toBe(600000n);   // (1,000 + 1,000) x 3 = $6,000
    expect(q.lines[0].monthlyPriceCents).toBe(300000n);
    expect(q.totalCents).toBe(1800000n);
  });
  it("follows fewer days a week", () => {
    expect(quote(DEFAULT_PRICING, { lines: [line("consultant", 4, 3)], durationMonths: 1, supportType: "remote" }).lines[0].monthlyPriceCents).toBe(525000n);
    expect(quote(DEFAULT_PRICING, { lines: [line("consultant", 1)], durationMonths: 1, supportType: "remote" }).lines[0].monthlyPriceCents).toBe(262500n);
  });
  it("sums several services as line items", () => {
    const q = quote(DEFAULT_PRICING, { lines: [line("consultant", 1), line("devops", 2)], durationMonths: 3, supportType: "remote" });
    expect(q.subtotalCents).toBe((262500n + 300000n) * 3n);
  });
  it("rounds half-up to the cent", () => {
    const cfg = { ...DEFAULT_PRICING, flatCostCents: 0, multiplier: 1, services: { x: { label: "X", baseSalaryCents: 100 } } };
    expect(quote(cfg, { lines: [line("x", 1, 5)], durationMonths: 1, supportType: "remote" }).lines[0].monthlyPriceCents).toBe(21n); // 100 x 40 / 192 = 20.83
  });
  it("applies the onsite premium only onsite", () => {
    const cfg = { ...DEFAULT_PRICING, onsitePremiumBps: 1000 };
    expect(quote(cfg, { lines: [line("devops", 2)], durationMonths: 6, supportType: "onsite" }).onsitePremiumCents).toBe(180000n);
    expect(quote(cfg, { lines: [line("devops", 2)], durationMonths: 6, supportType: "remote" }).onsitePremiumCents).toBe(0n);
  });
  it("refuses unknown and duplicated services, and more than the working pattern allows", () => {
    expect(() => quote(DEFAULT_PRICING, { lines: [line("astrology", 1)], durationMonths: 1, supportType: "remote" })).toThrow();
    expect(() => quote(DEFAULT_PRICING, { lines: [line("devops", 1), line("devops", 2)], durationMonths: 1, supportType: "remote" })).toThrow();
    expect(() => quote(DEFAULT_PRICING, { lines: [line("devops", 1, 7)], durationMonths: 1, supportType: "remote" })).toThrow();
  });
  it("describes the time on a line", () => {
    expect(workload(2, 6, 96)).toBe("2 wk/month · 6 days/wk · 96 h");
    expect(workload(null, null, 80)).toBe("80 h/month");
  });
  it("shows a discount as its own amount and lowers the total", () => {
    // Consultant, two weeks a month, six months: $5,250 a month, $31,500 list.
    const p = adjustContract([525000n], 6, 0, { kind: "discount", bps: 1000 });
    expect(p.monthly).toEqual([525000n]);                       // service prices unchanged
    expect(p.discount).toBe(315000n);                           // 10% = $3,150, printed on the contract
    expect(p.total).toBe(2835000n);                             // $28,350
  });
  it("builds a profit into the service prices with no separate line", () => {
    const p = adjustContract([525000n], 6, 0, { kind: "markup", bps: 2000 });
    expect(p.monthly).toEqual([630000n]);                       // $5,250 + 20% = $6,300 a month
    expect(p.discount).toBe(0n);
    expect(p.total).toBe(3780000n);                             // $37,800
    expect(p.listTotal).toBe(3150000n);                         // price-list total, for admins only
  });
  it("never compounds: every adjustment starts from the list price", () => {
    expect(adjustContract([525000n], 6, 0, null).total).toBe(3150000n);
    expect(adjustContract([525000n], 6, 0, { kind: "markup", bps: 2000 }).total).toBe(adjustContract([525000n], 6, 0, { kind: "markup", bps: 2000 }).total);
  });
  it("applies the discount after the onsite premium", () => {
    const p = adjustContract([100000n], 1, 1000, { kind: "discount", bps: 5000 });
    expect([p.subtotal, p.premium, p.discount, p.total]).toEqual([100000n, 10000n, 55000n, 55000n]);
  });
  it("refuses a discount over 90% and a profit over 200%, and reads percentages", () => {
    expect(() => adjustContract([1n], 1, 0, { kind: "discount", bps: 9001 })).toThrow();
    expect(() => adjustContract([1n], 1, 0, { kind: "markup", bps: 20001 })).toThrow();
    expect([percentToBps("10"), percentToBps("7.5"), percentToBps("12.25"), percentToBps("abc"), percentToBps("-5")]).toEqual([1000, 750, 1225, null, null]);
  });
  it("puts the midpoint at half the contract, rounded to the nearest month", () => {
    expect([1, 2, 5, 6, 12].map(midpointMonths)).toEqual([1, 1, 3, 3, 6]);
  });
});
