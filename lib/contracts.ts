import type { PoolClient } from "pg";
import { z } from "zod";
import { query, transaction } from "./db";
import { AppError } from "./errors";
import { button, emailShell, para, rowsTable } from "./email-layout";
import { usdToAedCents } from "./money";
import { DEFAULT_PRICING, midpointMonths, quote, quoteInputSchema, type PricingConfig } from "./pricing";
import { getSetting, getUsdToAedRate } from "./settings";
import type { User } from "./types";

// Client contracts: a public request with a computed price -> admin review -> approved and sent with the
// 50% signing invoice -> signed (with the client's confirmation) -> active (start date set; midpoint and
// final invoices scheduled) -> completed. Every step is audited and emailed; the database refuses any
// step out of order (migration 013).

export async function getPricing(): Promise<PricingConfig> {
  const v = await getSetting<Partial<PricingConfig>>("pricing", {});
  const cfg = { ...DEFAULT_PRICING, ...v, services: { ...(v.services && Object.keys(v.services).length ? v.services : DEFAULT_PRICING.services) } };
  return [cfg.standardHours, cfg.multiplier].every(n => Number.isInteger(n) && n > 0) ? cfg : DEFAULT_PRICING;
}
async function getTerms() {
  const v = await getSetting<{ signingBps?: number; midpointBps?: number; finalBps?: number; paymentTermsDays?: number }>("installments", {});
  const signingBps = v.signingBps ?? 5000, midpointBps = v.midpointBps ?? 2500;
  if (signingBps + midpointBps > 10000) throw new Error("Installment shares exceed 100%");
  return { signingBps, midpointBps, finalBps: 10000 - signingBps - midpointBps, paymentTermsDays: v.paymentTermsDays ?? 14 };
}

const base = () => process.env.NEXTAUTH_URL || "http://localhost:3000";
export const usd = (c: bigint | string | number) => { const v = BigInt(c); return `USD ${(v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(v % 100n).toString().padStart(2, "0")}`; };

// One mail layout for everything a client or an admin receives about a contract.
async function mail(eventKey: string, to: string, title: string, paragraphs: string[], rows: [string, string][] = [], link?: { href: string; label: string }) {
  const html = emailShell(title, `${paragraphs.map(para).join("")}${rowsTable(rows)}${link ? `<p style="margin:22px 0 0">${button(link.href, link.label)}</p>` : ""}`);
  const text = `Sankari Holding\n${title}\n\n${paragraphs.join("\n\n")}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}${link ? `\n\n${link.label}: ${link.href}` : ""}`;
  await query(`INSERT INTO email_outbox(event_key,recipient,subject,html,text_body) VALUES($1,lower($2),$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`, [eventKey, to, `[Sankari] ${title}`, html, text]);
}
const admins = async () => (await query<{ email: string }>(`SELECT email FROM users WHERE 'admin'=ANY(roles) AND disabled_at IS NULL`)).rows.map(r => r.email);
const audit = (c: PoolClient | null, actor: string | null, action: string, data: unknown, ip = "") => (c ? c.query.bind(c) : query)(`INSERT INTO audit_log(actor_id,action,after_data,ip_hash) VALUES($1,$2,$3,$4)`, [actor, action, JSON.stringify(data), ip]);

// ---------- Public request ----------
const today = () => new Date().toISOString().slice(0, 10);
export const contractRequestSchema = z.object({
  companyName: z.string().trim().min(2).max(160), contactName: z.string().trim().min(2).max(120), contactEmail: z.string().trim().toLowerCase().email().max(254),
  contactPhone: z.string().trim().min(6).max(40).regex(/^[+\d\s()-]+$/, "Phone: digits, spaces, + ( ) - only"), requirements: z.string().trim().min(10).max(4000),
  requestedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), website: z.string().max(0).optional().default(""),
}).and(quoteInputSchema);

export async function submitContractRequest(raw: unknown, ipHash: string) {
  const input = contractRequestSchema.parse(raw);
  if (input.requestedStartDate < today()) throw new AppError("The start date cannot be in the past");
  const cfg = await getPricing(), q = (() => { try { return quote(cfg, input); } catch (e) { throw new AppError((e as Error).message); } })(), rate = await getUsdToAedRate(), terms = await getTerms();
  const saved = await transaction(async c => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('contract-reference'))`);
    const year = new Date().getUTCFullYear(), n = (await c.query<{ n: number }>(`SELECT coalesce(max(substring(reference from '\\d+$')::int),0)+1 n FROM contracts WHERE reference LIKE $1`, [`CT-${year}-%`])).rows[0].n;
    const reference = `CT-${year}-${String(n).padStart(4, "0")}`;
    const snapshot = { config: cfg, usdToAedRate: rate, installments: terms, quotedAt: new Date().toISOString() };
    const ct = (await c.query<{ id: string }>(`INSERT INTO contracts(reference,company_name,contact_name,contact_email,contact_phone,requirements,support_type,requested_start_date,duration_months,currency,subtotal_cents,onsite_premium_cents,total_cents,pricing_snapshot,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'submitted') RETURNING id`,
      [reference, input.companyName, input.contactName, input.contactEmail, input.contactPhone, input.requirements, input.supportType, input.requestedStartDate, input.durationMonths, q.currency, q.subtotalCents.toString(), q.onsitePremiumCents.toString(), q.totalCents.toString(), JSON.stringify(snapshot)])).rows[0];
    for (const l of q.lines) await c.query(`INSERT INTO contract_line_items(contract_id,service_key,service_label,hours_per_month,base_salary_cents,flat_cost_cents,multiplier,standard_hours,monthly_full_time_cents,monthly_price_cents,line_total_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [ct.id, l.serviceKey, l.label, l.hoursPerMonth, l.baseSalaryCents, l.flatCostCents, l.multiplier, l.standardHours, l.monthlyFullTimeCents.toString(), l.monthlyPriceCents.toString(), l.lineTotalCents.toString()]);
    await audit(c, null, "contract.submitted", { contractId: ct.id, reference, company: input.companyName, totalCents: q.totalCents.toString() }, ipHash);
    return { id: ct.id, reference };
  });
  const rows: [string, string][] = [["Reference", saved.reference], ...q.lines.map(l => [l.label, `${l.hoursPerMonth} h/month · ${usd(l.monthlyPriceCents)} / month`] as [string, string]), ["Support", input.supportType === "onsite" ? "Onsite" : "Remote"], ["Start", input.requestedStartDate], ["Duration", `${input.durationMonths} months`], ["Estimated total", usd(q.totalCents)]];
  await mail(`contract-received:${saved.id}`, input.contactEmail, `We received your contract request ${saved.reference}`, [`Dear ${input.contactName},`, `Thank you. Our team will review your request and reply by email. Nothing is charged until you receive and confirm a contract.`, `شكرًا لكم. سيراجع فريقنا طلبكم ويرد عليكم بالبريد. لا يُحتسب أي مبلغ قبل أن تصلكم الاتفاقية وتؤكدوها.`], rows);
  for (const a of await admins()) await mail(`contract-new:${saved.id}:${a}`, a, `New contract request ${saved.reference} · ${input.companyName}`, [`${input.contactName} (${input.contactEmail}) asked for a contract.`, input.requirements.slice(0, 600)], rows, { href: new URL(`/admin/contracts/${saved.id}`, base()).href, label: "Review the request" });
  return { reference: saved.reference, totalCents: q.totalCents.toString(), currency: q.currency };
}

// ---------- Reading ----------
export type ContractRow = { id: string; reference: string; company_name: string; contact_name: string; contact_email: string; status: string; total_cents: string; currency: string; duration_months: number; requested_start_date: string; start_date: string | null; created_at: string; paid_cents: string; invoiced_cents: string };
export async function listContracts() {
  return (await query<ContractRow>(`SELECT c.id,c.reference,c.company_name,c.contact_name,c.contact_email,c.status::text,c.total_cents::text,c.currency,c.duration_months,to_char(c.requested_start_date,'YYYY-MM-DD') requested_start_date,to_char(c.start_date,'YYYY-MM-DD') start_date,c.created_at,
      coalesce((SELECT sum(paid_amount_cents) FROM invoices i WHERE i.contract_id=c.id AND i.status='paid'),0)::text paid_cents,coalesce((SELECT sum(amount_cents) FROM invoices i WHERE i.contract_id=c.id AND i.status<>'void'),0)::text invoiced_cents
    FROM contracts c WHERE c.sample IS NOT TRUE ORDER BY c.created_at DESC LIMIT 500`)).rows;
}
export async function getContract(id: string) {
  const c = (await query(`SELECT c.*,c.status::text status,c.support_type::text support_type,to_char(c.requested_start_date,'YYYY-MM-DD') requested_start_date,to_char(c.start_date,'YYYY-MM-DD') start_date,to_char(c.end_date,'YYYY-MM-DD') end_date,
      c.total_cents::text total_cents,c.subtotal_cents::text subtotal_cents,c.onsite_premium_cents::text onsite_premium_cents,u.name reviewed_by_name FROM contracts c LEFT JOIN users u ON u.id=c.reviewed_by WHERE c.id=$1`, [id])).rows[0];
  if (!c) return null;
  const lines = (await query(`SELECT service_key,service_label,hours_per_month,monthly_full_time_cents::text,monthly_price_cents::text,line_total_cents::text FROM contract_line_items WHERE contract_id=$1 ORDER BY created_at`, [id])).rows;
  const invoices = (await query(`SELECT id,reference,installment::text,share_bps,amount_cents::text,currency,due_trigger,to_char(due_date,'YYYY-MM-DD') due_date,status::text,sent_at,paid_at,paid_amount_cents::text FROM invoices WHERE contract_id=$1 ORDER BY array_position(ARRAY['signing','midpoint','final'],installment::text)`, [id])).rows;
  const assignments = (await query(`SELECT a.id,coalesce(u.name,a.staff_name) staff,a.service_key,a.monthly_cost_cents::text,to_char(a.started_on,'YYYY-MM-DD') started_on,to_char(a.ended_on,'YYYY-MM-DD') ended_on FROM contract_assignments a LEFT JOIN users u ON u.id=a.user_id WHERE a.contract_id=$1 ORDER BY a.created_at`, [id])).rows;
  const history = (await query(`SELECT a.action,a.created_at,u.name actor,a.after_data FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id WHERE a.action LIKE 'contract.%' AND a.after_data->>'contractId'=$1 ORDER BY a.created_at`, [id])).rows;
  return { contract: c, lines, invoices, assignments, history };
}

// ---------- Admin actions ----------
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review") }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal("signed"), evidence: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal("activate"), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(2000) }),
]);

export async function contractAction(id: string, input: z.infer<typeof actionSchema>, user: User, ipHash: string) {
  if (!user.roles.includes("admin")) throw new AppError("Only admins can act on contracts", 403);
  const terms = await getTerms();
  const r = await transaction(async c => {
    const ct = (await c.query(`SELECT *,status::text status,to_char(requested_start_date,'YYYY-MM-DD') rsd FROM contracts WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!ct) throw new AppError("Contract not found", 404);
    const need = (...s: string[]) => { if (!s.includes(ct.status)) throw new AppError(`This contract is ${ct.status.replace("_", " ")}; that step is not available`, 409); };
    let emailTo: "client" | null = null; const out: Record<string, unknown> = { contractId: id, reference: ct.reference, action: input.action };
    if (input.action === "review") { need("submitted"); await c.query(`UPDATE contracts SET status='under_review',reviewed_by=$2,reviewed_at=now() WHERE id=$1`, [id, user.id]); }
    else if (input.action === "approve") {
      need("submitted", "under_review");
      await c.query(`UPDATE contracts SET status='approved',reviewed_by=$2,reviewed_at=now() WHERE id=$1`, [id, user.id]);
      const split = (await c.query<{ first_cents: string; second_cents: string; final_cents: string }>(`SELECT * FROM installment_split($1,$2,$3)`, [ct.total_cents, terms.signingBps, terms.midpointBps])).rows[0];
      const inv = [["signing", terms.signingBps, split.first_cents, "On signing, before work starts"], ["midpoint", terms.midpointBps, split.second_cents, "At the contract midpoint"], ["final", terms.finalBps, split.final_cents, "At the end of the contract"]] as const;
      for (const [k, bps, amt, trig] of inv) await c.query(`INSERT INTO invoices(contract_id,reference,installment,share_bps,amount_cents,currency,due_trigger,due_date,status,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, `${ct.reference}-${k === "signing" ? 1 : k === "midpoint" ? 2 : 3}`, k, bps, amt, ct.currency, trig, k === "signing" ? today() : null, k === "signing" ? "sent" : "pending", k === "signing" ? new Date() : null]);
      await c.query(`UPDATE contracts SET status='contract_sent',contract_sent_at=now() WHERE id=$1`, [id]);
      out.invoices = inv.map(([k, , amt]) => ({ installment: k, amountCents: amt })); emailTo = "client";
    }
    else if (input.action === "reject") { need("submitted", "under_review"); await c.query(`UPDATE contracts SET status='rejected',rejection_reason=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1`, [id, input.reason, user.id]); out.reason = input.reason; emailTo = "client"; }
    else if (input.action === "signed") { need("contract_sent"); await c.query(`UPDATE contracts SET status='signed',signed_at=now(),signed_evidence=$2 WHERE id=$1`, [id, input.evidence]); out.evidence = input.evidence; }
    else if (input.action === "activate") {
      need("signed");
      const paid = (await c.query(`SELECT 1 FROM invoices WHERE contract_id=$1 AND installment='signing' AND status='paid'`, [id])).rowCount;
      if (!paid) throw new AppError("The 50% signing invoice must be paid before work starts", 409);
      const mid = midpointMonths(ct.duration_months);
      await c.query(`UPDATE contracts SET status='active',start_date=$2::date,end_date=($2::date+($3||' months')::interval)::date WHERE id=$1`, [id, input.startDate, String(ct.duration_months)]);
      await c.query(`UPDATE invoices SET due_date=($2::date+($3||' months')::interval)::date WHERE contract_id=$1 AND installment='midpoint' AND status='pending'`, [id, input.startDate, String(mid)]);
      await c.query(`UPDATE invoices SET due_date=($2::date+($3||' months')::interval)::date WHERE contract_id=$1 AND installment='final' AND status='pending'`, [id, input.startDate, String(ct.duration_months)]);
      out.startDate = input.startDate; out.midpointMonth = mid; emailTo = "client";
    }
    else if (input.action === "cancel") {
      need("submitted", "under_review", "approved", "contract_sent", "signed", "active");
      await c.query(`UPDATE contracts SET status='cancelled',rejection_reason=$2 WHERE id=$1`, [id, input.reason]);
      await c.query(`UPDATE invoices SET status='void' WHERE contract_id=$1 AND status IN ('pending','sent','overdue')`, [id]);
      out.reason = input.reason; emailTo = "client";
    }
    await audit(c, user.id, `contract.${input.action}`, out, ipHash);
    return { ct, emailTo, out };
  });
  const { ct } = r, detail = new URL(`/admin/contracts/${id}`, base()).href;
  if (r.emailTo) {
    const salutation = `Dear ${ct.contact_name},`;
    if (input.action === "approve") {
      const inv = (await query<{ reference: string; amount_cents: string }>(`SELECT reference,amount_cents::text FROM invoices WHERE contract_id=$1 AND installment='signing'`, [id])).rows[0];
      const lines = (await query<{ service_label: string; hours_per_month: number; monthly_price_cents: string }>(`SELECT service_label,hours_per_month,monthly_price_cents::text FROM contract_line_items WHERE contract_id=$1`, [id])).rows;
      await mail(`contract-sent:${id}`, ct.contact_email, `Your contract ${ct.reference} and the signing invoice`, [salutation,
        `We have approved your request. The contract terms are below, with the first invoice: 50% on signing, before work starts. 25% follows at the contract midpoint and the final 25% at the end.`,
        `To accept, reply to this email confirming the contract, or send back a signed copy, and pay the signing invoice. We start on the agreed date once both are received.`,
        `للموافقة، يرجى الرد على هذا البريد بتأكيد الاتفاقية أو إرسال نسخة موقعة، وسداد فاتورة التوقيع. نبدأ في التاريخ المتفق عليه بعد استلامهما.`],
        [["Contract", ct.reference], ["Company", ct.company_name], ...lines.map(l => [l.service_label, `${l.hours_per_month} h/month · ${usd(l.monthly_price_cents)} / month`] as [string, string]),
         ["Support", ct.support_type === "onsite" ? "Onsite" : "Remote"], ["Duration", `${ct.duration_months} months from ${ct.rsd}`], ["Contract total", usd(ct.total_cents)],
         ["Invoice", inv.reference], ["Amount due now (50%)", usd(inv.amount_cents)], ["Payment terms", `${terms.paymentTermsDays} days`]]);
    } else if (input.action === "reject") await mail(`contract-rejected:${id}`, ct.contact_email, `About your contract request ${ct.reference}`, [salutation, `We are unable to proceed with this request.`, `Reason: ${r.out.reason}`]);
    else if (input.action === "activate") await mail(`contract-active:${id}`, ct.contact_email, `Your contract ${ct.reference} starts on ${r.out.startDate}`, [salutation, `Thank you for your payment. Work starts on ${r.out.startDate}. The 25% midpoint invoice is issued after ${r.out.midpointMonth} month(s), and the final 25% at the end of the contract.`]);
    else if (input.action === "cancel") await mail(`contract-cancelled:${id}`, ct.contact_email, `Contract ${ct.reference} cancelled`, [salutation, `This contract has been cancelled. Any unpaid invoices are void.`, `Reason: ${r.out.reason}`]);
  }
  for (const a of await admins()) await mail(`contract-${input.action}:${id}:${a}`, a, `${ct.reference}: ${input.action} by ${user.name}`, [`${ct.company_name} · ${usd(ct.total_cents)}`], [], { href: detail, label: "Open the contract" });
  return { id, action: input.action };
}

export const paidSchema = z.object({ paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/) });
// Payment received: the invoice becomes paid and one inflow line lands in the ledger, in USD and in
// AED at the rate frozen on the contract.
export async function markInvoicePaid(invoiceId: string, input: z.infer<typeof paidSchema>, user: User, ipHash: string) {
  if (!user.roles.includes("admin") && !user.roles.includes("accountant")) throw new AppError("Only admins and accountants record payments", 403);
  const [w, f = ""] = input.amount.split("."), cents = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  if (cents <= 0n) throw new AppError("Amount must be more than zero");
  if (input.paidOn > today()) throw new AppError("A payment cannot be dated in the future");
  const r = await transaction(async c => {
    const inv = (await c.query(`SELECT i.*,i.status::text status,i.installment::text installment,c.reference contract_ref,c.company_name,c.contact_email,c.contact_name,c.pricing_snapshot,c.status::text contract_status,c.id cid FROM invoices i JOIN contracts c ON c.id=i.contract_id WHERE i.id=$1 FOR UPDATE OF i`, [invoiceId])).rows[0];
    if (!inv) throw new AppError("Invoice not found", 404);
    if (!["sent", "overdue"].includes(inv.status)) throw new AppError(`This invoice is ${inv.status}; only a sent invoice can be paid`, 409);
    if (cents !== BigInt(inv.amount_cents)) throw new AppError(`The amount received must equal the invoice (${usd(inv.amount_cents)}); record a partial payment with accounting`, 409);
    await c.query(`UPDATE invoices SET status='paid',paid_at=$2::date,paid_amount_cents=$3 WHERE id=$1`, [invoiceId, input.paidOn, cents.toString()]);
    const rate = String(inv.pricing_snapshot?.usdToAedRate ?? await getUsdToAedRate());
    await c.query(`INSERT INTO ledger_entries(direction,source,occurred_on,amount_cents,currency,description,category,invoice_id,contract_id,created_by,aed_rate,amount_aed_cents) VALUES('inflow','receivable',$1,$2,$3,$4,'contract',$5,$6,$7,$8,$9)`,
      [input.paidOn, cents.toString(), inv.currency, `${inv.reference} · ${inv.company_name}`, invoiceId, inv.cid, user.id, rate, (inv.currency === "AED" ? cents : usdToAedCents(cents, rate)).toString()]);
    await audit(c, user.id, "contract.invoice_paid", { contractId: inv.cid, invoiceId, reference: inv.reference, amountCents: cents.toString(), paidOn: input.paidOn }, ipHash);
    // The contract is complete once it has ended and every invoice is paid.
    await c.query(`UPDATE contracts SET status='completed',completed_at=now() WHERE id=$1 AND status='active' AND end_date<=current_date AND NOT EXISTS (SELECT 1 FROM invoices WHERE contract_id=$1 AND status NOT IN ('paid','void'))`, [inv.cid]);
    return inv;
  });
  await mail(`invoice-paid:${invoiceId}`, r.contact_email, `Payment received for ${r.reference}`, [`Dear ${r.contact_name},`, `We received ${usd(cents)} for invoice ${r.reference} on ${input.paidOn}. Thank you.`]);
  return { invoiceId, status: "paid" };
}

export const assignmentSchema = z.object({ staffName: z.string().trim().min(2).max(120), userId: z.string().uuid().nullable().optional(), serviceKey: z.string().min(1).max(40), monthlyCost: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/), startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export async function addAssignment(contractId: string, input: z.infer<typeof assignmentSchema>, user: User, ipHash: string) {
  if (!user.roles.includes("admin")) throw new AppError("Only admins assign staff", 403);
  const [w, f = ""] = input.monthlyCost.split("."), cents = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  if (!(await query(`SELECT 1 FROM contracts WHERE id=$1`, [contractId])).rowCount) throw new AppError("Contract not found", 404);
  const r = (await query<{ id: string }>(`INSERT INTO contract_assignments(contract_id,user_id,staff_name,service_key,monthly_cost_cents,started_on) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [contractId, input.userId ?? null, input.staffName, input.serviceKey, cents.toString(), input.startedOn])).rows[0];
  await audit(null, user.id, "contract.assignment_added", { contractId, ...input, monthlyCostCents: cents.toString() }, ipHash);
  return r;
}

// Worker: issue midpoint/final invoices on their date, mark unpaid ones overdue after the payment terms.
export async function runContracts() {
  const terms = await getTerms(), out = { issued: 0, overdue: 0 };
  const due = await query<{ id: string; reference: string; amount_cents: string; installment: string; contact_email: string; contact_name: string; company_name: string; contract_ref: string }>(
    `UPDATE invoices i SET status='sent',sent_at=now() FROM contracts c WHERE c.id=i.contract_id AND c.status='active' AND i.status='pending' AND i.due_date<=current_date
      RETURNING i.id,i.reference,i.amount_cents::text,i.installment::text,c.contact_email,c.contact_name,c.company_name,c.reference contract_ref`);
  for (const i of due.rows) {
    await mail(`invoice-issued:${i.id}`, i.contact_email, `Invoice ${i.reference} · ${i.installment === "midpoint" ? "25% at midpoint" : "final 25%"}`, [`Dear ${i.contact_name},`, `Please find the ${i.installment === "midpoint" ? "midpoint" : "final"} invoice for contract ${i.contract_ref}.`], [["Invoice", i.reference], ["Amount", usd(i.amount_cents)], ["Payment terms", `${terms.paymentTermsDays} days`]]);
    await audit(null, null, "contract.invoice_issued", { invoiceId: i.id, reference: i.reference });
    out.issued++;
  }
  const late = await query<{ id: string; reference: string; company_name: string }>(`UPDATE invoices i SET status='overdue' FROM contracts c WHERE c.id=i.contract_id AND i.status='sent' AND i.sent_at < now()-($1||' days')::interval RETURNING i.id,i.reference,c.company_name`, [String(terms.paymentTermsDays)]);
  for (const i of late.rows) for (const a of await admins()) await mail(`invoice-overdue:${i.id}:${a}`, a, `Overdue: ${i.reference} · ${i.company_name}`, [`Invoice ${i.reference} is unpaid after ${terms.paymentTermsDays} days.`], [], { href: new URL("/admin/ledger", base()).href, label: "Open the ledger" });
  out.overdue = late.rowCount ?? 0;
  return out;
}
