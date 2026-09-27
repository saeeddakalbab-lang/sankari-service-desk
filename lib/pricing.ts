import { z } from "zod";

// Contract pricing, in integer cents:
//   monthly full-time rate = (base salary + flat cost) x multiplier
//   full month             = hours per day x days per week x weeks per month   (8 x 6 x 4 = 192 h)
//   hours worked per month = weeks on site per month x days per week x hours per day
//                            (a consultant in the mall two weeks a month, 6 days a week, is 96 h: half a month)
//   monthly price          = full-time rate x hours worked / full month   (half-up to the cent)
//   line total             = monthly price x contract months
//   onsite premium         = subtotal x onsite premium (basis points), half-up
// The same function runs in the browser (live quote) and on the server (the price that is saved);
// the browser figure is only a preview and is never trusted.

export type PricingConfig = { currency: string; hoursPerDay: number; daysPerWeek: number; weeksPerMonth: number; standardHours: number; flatCostCents: number; multiplier: number; onsitePremiumBps: number; services: Record<string, { label: string; baseSalaryCents: number }> };
export const DEFAULT_PRICING: PricingConfig = { currency: "USD", hoursPerDay: 8, daysPerWeek: 6, weeksPerMonth: 4, standardHours: 192, flatCostCents: 100000, multiplier: 3, onsitePremiumBps: 0,
  services: { consultant: { label: "Consultant", baseSalaryCents: 250000 }, it_support: { label: "IT Support Specialist", baseSalaryCents: 100000 }, devops: { label: "DevOps", baseSalaryCents: 100000 }, cybersecurity: { label: "Cybersecurity", baseSalaryCents: 100000 } } };
export const MAX_MONTHS = 60;

// The full month always follows the working pattern, so an older stored "standardHours" cannot disagree with it.
export function withWorkPattern(cfg: PricingConfig): PricingConfig { return { ...cfg, standardHours: cfg.hoursPerDay * cfg.daysPerWeek * cfg.weeksPerMonth }; }

export const quoteInputSchema = z.object({
  lines: z.array(z.object({ service: z.string().min(1).max(40), weeksPerMonth: z.number().int().min(1).max(4), daysPerWeek: z.number().int().min(1).max(7) })).min(1).max(8),
  durationMonths: z.number().int().min(1).max(MAX_MONTHS),
  supportType: z.enum(["onsite", "remote"]),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

const divHalfUp = (n: bigint, d: bigint) => (n * 2n + d) / (2n * d);

export function quote(config: PricingConfig, input: QuoteInput) {
  const cfg = withWorkPattern(config), seen = new Set<string>();
  const lines = input.lines.map(l => {
    const svc = cfg.services[l.service];
    if (!svc) throw new Error(`Unknown service: ${l.service}`);
    if (seen.has(l.service)) throw new Error(`${svc.label} is listed twice; put all its time on one line`);
    if (l.weeksPerMonth > cfg.weeksPerMonth || l.daysPerWeek > cfg.daysPerWeek) throw new Error(`At most ${cfg.weeksPerMonth} weeks a month and ${cfg.daysPerWeek} days a week`);
    seen.add(l.service);
    const monthlyFullTime = (BigInt(svc.baseSalaryCents) + BigInt(cfg.flatCostCents)) * BigInt(cfg.multiplier);
    const hoursPerMonth = l.weeksPerMonth * l.daysPerWeek * cfg.hoursPerDay;
    const monthlyPrice = divHalfUp(monthlyFullTime * BigInt(hoursPerMonth), BigInt(cfg.standardHours));
    return { serviceKey: l.service, label: svc.label, weeksPerMonth: l.weeksPerMonth, daysPerWeek: l.daysPerWeek, hoursPerMonth, baseSalaryCents: svc.baseSalaryCents, flatCostCents: cfg.flatCostCents, multiplier: cfg.multiplier,
      standardHours: cfg.standardHours, monthlyFullTimeCents: monthlyFullTime, monthlyPriceCents: monthlyPrice, lineTotalCents: monthlyPrice * BigInt(input.durationMonths) };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0n);
  const premium = input.supportType === "onsite" ? divHalfUp(subtotal * BigInt(cfg.onsitePremiumBps), 10000n) : 0n;
  return { currency: cfg.currency, lines, subtotalCents: subtotal, onsitePremiumCents: premium, totalCents: subtotal + premium,
    monthlyCents: lines.reduce((s, l) => s + l.monthlyPriceCents, 0n) };
}

// "2 weeks/month · 6 days/week · 96 h"; lines saved before weeks existed show their hours only.
export const workload = (weeks: number | null | undefined, days: number | null | undefined, hours: number) =>
  weeks && days ? `${weeks} wk/month · ${days} days/wk · ${hours} h` : `${hours} h/month`;

// Midpoint: half the contract, rounded to the nearest whole month (a 5-month contract -> month 3).
export const midpointMonths = (duration: number) => Math.floor((duration + 1) / 2);
