import { usdInArabicWords } from "./arabic-words";
import { getContract, getContractParty, getTerms } from "./contracts";
import { arMonths, buildContract, serviceFor, type ClientDetails } from "./contract-template";
import { midpointMonths } from "./pricing";

// The data behind the printed contract and invoices, from the contract's saved figures only.
// Before approval there are no invoices yet, so the payment plan is split the same way the database
// will split it (installment_split: signing and midpoint floor, final takes the remainder).
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return ymd(d); };
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

export async function contractDocument(id: string) {
  const d = await getContract(id);
  if (!d) return null;
  const c = d.contract as Record<string, any>, [party, terms] = await Promise.all([getContractParty(), getTerms()]);
  const total = BigInt(c.total_cents);
  const installments = d.invoices.length
    ? d.invoices.filter(i => i.status !== "void").map(i => ({ key: i.installment as "signing" | "midpoint" | "final", bps: Number(i.share_bps), cents: BigInt(i.amount_cents) }))
    : (() => { const a = total * BigInt(terms.signingBps) / 10000n, b = total * BigInt(terms.midpointBps) / 10000n; return [{ key: "signing" as const, bps: terms.signingBps, cents: a }, { key: "midpoint" as const, bps: terms.midpointBps, cents: b }, { key: "final" as const, bps: terms.finalBps, cents: total - a - b }]; })();
  const start = c.start_date ?? c.requested_start_date, details = (c.client_details ?? {}) as ClientDetails;
  const doc = buildContract({
    reference: c.reference, controlDate: ymd(c.contract_sent_at ? new Date(c.contract_sent_at) : new Date()), months: c.duration_months, startDate: start, endDate: c.end_date ?? addMonths(start, c.duration_months), supportType: c.support_type,
    lines: d.lines.map(l => ({ serviceKey: l.service_key, label: l.service_label, hoursPerMonth: l.hours_per_month, weeksPerMonth: l.weeks_per_month, daysPerWeek: l.days_per_week, monthlyPriceCents: BigInt(l.monthly_price_cents), lineTotalCents: BigInt(l.line_total_cents) })),
    subtotalCents: BigInt(c.subtotal_cents), premiumCents: BigInt(c.onsite_premium_cents), discountCents: BigInt(c.discount_cents ?? 0), discountBps: Number(c.adjustment_bps ?? 0), totalCents: total,
    installments, midpointMonths: midpointMonths(c.duration_months), paymentTermsDays: terms.paymentTermsDays, party,
    client: { ...details, companyName: c.company_name, contactName: c.contact_name, contactEmail: c.contact_email, contactPhone: c.contact_phone ?? "" },
  });
  return { doc, detail: d, party, terms };
}

// The quotation the client accepts before any contract: services and load, monthly and total price,
// any discount, the payment plan. Same saved figures as the contract that follows.
export async function quoteDocument(id: string) {
  const x = await contractDocument(id);
  if (!x) return null;
  const c = x.detail.contract as Record<string, any>, t = x.terms;
  return {
    party: x.party, reference: c.reference, company: (c.client_details?.legalName as string) || c.company_name, contact: c.contact_name, email: c.contact_email,
    date: ymd(c.quote_sent_at ? new Date(c.quote_sent_at) : new Date()), status: c.status as string, decidedAt: c.quote_decided_at ? ymd(new Date(c.quote_decided_at)) : null, note: (c.quote_note as string) ?? "",
    months: c.duration_months as number, start: c.requested_start_date as string, supportType: c.support_type as string,
    lines: x.detail.lines.map(l => ({ ar: serviceFor(l.service_key).name, en: l.service_label as string, hours: l.hours_per_month as number, weeks: l.weeks_per_month as number | null, days: l.days_per_week as number | null, monthlyCents: BigInt(l.monthly_price_cents), totalCents: BigInt(l.line_total_cents) })),
    premiumCents: BigInt(c.onsite_premium_cents), subtotalCents: BigInt(c.subtotal_cents) + BigInt(c.onsite_premium_cents), discountCents: BigInt(c.discount_cents ?? 0), discountBps: Number(c.adjustment_bps ?? 0), totalCents: BigInt(c.total_cents),
    words: usdInArabicWords(c.total_cents), plan: [t.signingBps, t.midpointBps, t.finalBps], requirements: c.requirements as string,
  };
}
export type QuoteDoc = NonNullable<Awaited<ReturnType<typeof quoteDocument>>>;

const INST_AR: Record<string, string> = { signing: "دفعة التوقيع", midpoint: "دفعة منتصف المدة", final: "الدفعة الختامية" };
const INST_EN: Record<string, string> = { signing: "Signing installment", midpoint: "Midpoint installment", final: "Final installment" };
export async function invoiceDocument(id: string, invoiceId: string) {
  const x = await contractDocument(id);
  if (!x) return null;
  const inv = x.detail.invoices.find(i => i.id === invoiceId);
  if (!inv) return null;
  const c = x.detail.contract as Record<string, any>, details = (c.client_details ?? {}) as ClientDetails;
  const issued = inv.sent_at ? ymd(new Date(inv.sent_at)) : inv.due_date || ymd(new Date());
  const services = x.detail.lines.map(l => serviceFor(l.service_key).name).join("، ");
  return {
    party: x.party, contractRef: c.reference, reference: inv.reference, status: inv.status as string, issued, due: addDays(issued, x.terms.paymentTermsDays), paidAt: inv.paid_at ? ymd(new Date(inv.paid_at)) : null,
    billTo: { name: details.legalName || c.company_name, contact: c.contact_name, email: c.contact_email, phone: c.contact_phone ?? "", address: [details.address, details.city].filter(Boolean).join(" – "), taxNumber: details.taxNumber ?? "", registry: details.registry ?? "" },
    line: { ar: `${INST_AR[inv.installment] ?? inv.installment} (${Number(inv.share_bps) / 100}%) من البدل الإجمالي للعقد ${c.reference} — ${services} لمدة ${arMonths(c.duration_months)}`, en: `${INST_EN[inv.installment] ?? inv.installment} (${Number(inv.share_bps) / 100}%) of contract ${c.reference}` },
    amountCents: BigInt(inv.amount_cents), contractTotalCents: BigInt(c.total_cents), words: usdInArabicWords(inv.amount_cents), paymentTermsDays: x.terms.paymentTermsDays,
  };
}
export type InvoiceDoc = NonNullable<Awaited<ReturnType<typeof invoiceDocument>>>;
