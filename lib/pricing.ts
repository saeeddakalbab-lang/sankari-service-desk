import { z } from "zod";

// Contract pricing, in integer cents:
//   monthly full-time rate = (base salary + flat cost) x multiplier
//   monthly price          = full-time rate x hours per month / standard hours   (half-up to the cent)
//   line total             = monthly price x contract months
//   onsite premium         = subtotal x onsite premium (basis points), half-up
// The same function runs in the browser (live quote) and on the server (the price that is saved);
// the browser figure is only a preview and is never trusted.

export type PricingConfig = { currency: string; standardHours: number; flatCostCents: number; multiplier: number; onsitePremiumBps: number; services: Record<string, { label: string; baseSalaryCents: number }> };
export const DEFAULT_PRICING: PricingConfig = { currency: "USD", standardHours: 160, flatCostCents: 100000, multiplier: 3, onsitePremiumBps: 0,
  services: { consultant: { label: "Consultant", baseSalaryCents: 250000 }, it_support: { label: "IT Support Specialist", baseSalaryCents: 100000 }, devops: { label: "DevOps", baseSalaryCents: 100000 }, cybersecurity: { label: "Cybersecurity", baseSalaryCents: 100000 } } };
export const MAX_HOURS = 744, MAX_MONTHS = 60;

export const quoteInputSchema = z.object({
  lines: z.array(z.object({ service: z.string().min(1).max(40), hoursPerMonth: z.number().int().min(1).max(MAX_HOURS) })).min(1).max(8),
  durationMonths: z.number().int().min(1).max(MAX_MONTHS),
  supportType: z.enum(["onsite", "remote"]),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

const divHalfUp = (n: bigint, d: bigint) => (n * 2n + d) / (2n * d);

export function quote(cfg: PricingConfig, input: QuoteInput) {
  const seen = new Set<string>();
  const lines = input.lines.map(l => {
    const svc = cfg.services[l.service];
    if (!svc) throw new Error(`Unknown service: ${l.service}`);
    if (seen.has(l.service)) throw new Error(`${svc.label} is listed twice; put all its hours on one line`);
    seen.add(l.service);
    const monthlyFullTime = (BigInt(svc.baseSalaryCents) + BigInt(cfg.flatCostCents)) * BigInt(cfg.multiplier);
    const monthlyPrice = divHalfUp(monthlyFullTime * BigInt(l.hoursPerMonth), BigInt(cfg.standardHours));
    return { serviceKey: l.service, label: svc.label, hoursPerMonth: l.hoursPerMonth, baseSalaryCents: svc.baseSalaryCents, flatCostCents: cfg.flatCostCents, multiplier: cfg.multiplier,
      standardHours: cfg.standardHours, monthlyFullTimeCents: monthlyFullTime, monthlyPriceCents: monthlyPrice, lineTotalCents: monthlyPrice * BigInt(input.durationMonths) };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0n);
  const premium = input.supportType === "onsite" ? divHalfUp(subtotal * BigInt(cfg.onsitePremiumBps), 10000n) : 0n;
  return { currency: cfg.currency, lines, subtotalCents: subtotal, onsitePremiumCents: premium, totalCents: subtotal + premium,
    monthlyCents: lines.reduce((s, l) => s + l.monthlyPriceCents, 0n) };
}

// Midpoint: half the contract, rounded to the nearest whole month (a 5-month contract -> month 3).
export const midpointMonths = (duration: number) => Math.floor((duration + 1) / 2);
