import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { getContract, usd } from "@/lib/contracts";
import { fmtDate } from "@/lib/format";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract", robots: { index: false, follow: false } };

// A4 contract, or one invoice with ?invoice=<id>. "Save as PDF" in the print dialog makes the file to send.
export default async function ContractPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invoice?: string }> }) {
  const [{ id }, q, { user, t, dir, locale }] = await Promise.all([params, searchParams, getViewer()]);
  if (!user) redirect("/login");
  if (!(user.roles.includes("admin") || user.roles.includes("accountant"))) redirect("/");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await getContract(id);
  if (!d) notFound();
  const c = d.contract as Record<string, any>, inv = q.invoice ? d.invoices.find(i => i.id === q.invoice) : null;
  if (q.invoice && !inv) notFound();
  return <div className="print-doc" lang={locale} dir={dir}>
    <header className="print-head">
      <div><Logo tone="dark" width={96} /></div>
      <div style={{ textAlign: dir === "rtl" ? "left" : "right" }}><h1>{inv ? t("ct.invoices") : t("ct.title")} · <bdi dir="ltr">{inv ? inv.reference : c.reference}</bdi></h1><p className="soft">{fmtDate(new Date())}</p></div>
    </header>
    <div className="no-print" style={{ margin: "12px 0" }}><PrintButton label={inv ? t("ct.printInvoice") : t("ct.print")} /></div>
    <dl className="print-totals">
      <div><dt>{t("ct.client")}</dt><dd style={{ fontFamily: "inherit" }}>{c.company_name}<br /><span style={{ fontWeight: 400, fontSize: 13 }}>{c.contact_name} · <bdi dir="ltr">{c.contact_email}</bdi></span></dd></div>
      <div><dt>{t("cr.support")}</dt><dd style={{ fontFamily: "inherit" }}>{t(c.support_type === "onsite" ? "cr.onsite" : "cr.remote")}</dd></div>
      <div><dt>{t("ct.dates")}</dt><dd dir="ltr">{c.start_date ? `${c.start_date} → ${c.end_date}` : `${c.requested_start_date} · ${c.duration_months} m`}</dd></div>
      <div><dt>{inv ? t("ct.amount") : t("ct.total")}</dt><dd dir="ltr">{usd(inv ? inv.amount_cents : c.total_cents)}</dd></div>
    </dl>
    {inv ? <table className="print-table"><thead><tr><th>{t("ct.ref")}</th><th>{t("ct.invoices")}</th><th>{t("ct.due")}</th><th>{t("ct.amount")}</th></tr></thead>
      <tbody><tr><td dir="ltr">{inv.reference}</td><td>{t(`ct.inv.${inv.installment}` as "ct.inv.signing")} · {c.reference}</td><td dir="ltr">{inv.sent_at ? fmtDate(inv.sent_at) : inv.due_date || inv.due_trigger}</td><td dir="ltr">{usd(inv.amount_cents)}</td></tr>
        <tr className="print-total"><td /><td /><td>{t("ct.total")}</td><td dir="ltr">{usd(inv.amount_cents)}</td></tr></tbody></table>
    : <>
      <table className="print-table"><thead><tr><th>{t("cr.service")}</th><th>{t("cr.hours")}</th><th>{t("ct.monthly")}</th><th>{t("ct.lineTotal")}</th></tr></thead>
        <tbody>{d.lines.map(l => <tr key={l.service_key}><td>{l.service_label}</td><td dir="ltr">{l.hours_per_month}</td><td dir="ltr">{usd(l.monthly_price_cents)}</td><td dir="ltr">{usd(l.line_total_cents)}</td></tr>)}
          {BigInt(c.onsite_premium_cents) > 0n && <tr><td>{t("ct.premium")}</td><td /><td /><td dir="ltr">{usd(c.onsite_premium_cents)}</td></tr>}
          <tr className="print-total"><td>{t("ct.total")}</td><td /><td /><td dir="ltr">{usd(c.total_cents)}</td></tr></tbody></table>
      <h2 style={{ fontSize: 15, margin: "20px 0 8px" }}>{t("ct.invoices")}</h2>
      <table className="print-table"><thead><tr><th>{t("ct.ref")}</th><th>{t("ct.invoices")}</th><th>{t("ct.due")}</th><th>{t("ct.amount")}</th></tr></thead>
        <tbody>{d.invoices.map(i => <tr key={i.id}><td dir="ltr">{i.reference}</td><td>{t(`ct.inv.${i.installment}` as "ct.inv.signing")}</td><td>{i.due_trigger}</td><td dir="ltr">{usd(i.amount_cents)}</td></tr>)}</tbody></table>
      <h2 style={{ fontSize: 15, margin: "20px 0 8px" }}>{t("ct.requirements")}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{c.requirements}</p>
    </>}
  </div>;
}
