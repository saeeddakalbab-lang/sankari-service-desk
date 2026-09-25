import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { fmtDateTime } from "@/lib/format";
import { translator } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { buildStatement, monthRe } from "@/lib/statements";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "كشف الاشتراكات", robots: { index: false, follow: false } };
const aed = (c: string) => formatMoney(c, "AED");

// The Arabic, right-to-left statement for accounting, laid out for A4. "Save as PDF" in the print
// dialog produces the PDF; the same page always renders in Arabic whatever the viewer's language.
export default async function StatementPrint({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [{ user }, q] = await Promise.all([getViewer(), searchParams]);
  if (!user) redirect("/login");
  if (!(user.roles.includes("admin") || user.roles.includes("accountant"))) redirect("/");
  if (!q.month || !monthRe.test(q.month)) redirect("/admin/statements");
  const s = await buildStatement(q.month), t = translator("ar");
  let bal = BigInt(s.openingAedCents);
  return <div className="print-doc" lang="ar" dir="rtl">
    <header className="print-head">
      <div><Logo tone="dark" width={96} /></div>
      <div style={{ textAlign: "left" }}><h1>{t("st2.printTitle")} · <bdi dir="ltr">{s.month}</bdi></h1><p className="soft">{t("st2.printedOn", { date: fmtDateTime(new Date()) })}</p></div>
    </header>
    <div className="no-print" style={{ margin: "12px 0" }}><PrintButton label={t("st2.print")} /></div>
    <dl className="print-totals">
      {[["st2.opening", s.openingAedCents], ["st2.charges", s.chargesAedCents], ["st2.credits", s.creditsAedCents], ["st2.closing", s.closingAedCents]].map(([k, v]) =>
        <div key={k}><dt>{t(k as "st2.opening")}</dt><dd dir="ltr">{aed(v)}</dd></div>)}
    </dl>
    <table className="print-table">
      <thead><tr><th>{t("st2.date")}</th><th>{t("st2.ref")}</th><th>{t("st2.service")}</th><th>{t("subs.beneficiary")}</th><th>{t("bills.company")}</th><th>{t("st2.original")}</th><th>{t("st2.debit")}</th><th>{t("st2.credit")}</th><th>{t("st2.balance")}</th><th>{t("st2.approvedBy")}</th></tr></thead>
      <tbody>
        <tr><td dir="ltr">{s.month}-01</td><td /><td><strong>{t("st2.opening")}</strong></td><td /><td /><td /><td /><td /><td dir="ltr">{aed(s.openingAedCents)}</td><td /></tr>
        {s.lines.map(l => { bal += BigInt(l.debitAedCents) - BigInt(l.creditAedCents); return <tr key={l.reference}>
          <td dir="ltr">{l.date}</td><td dir="ltr">{l.reference}</td><td>{l.kind === "charge" ? l.service : `${t(l.kind === "payment" ? "st2.kind.payment" : "st2.kind.refund")}${l.service ? ` · ${l.service}` : ""}`}</td>
          <td>{l.beneficiary}</td><td>{l.company}</td><td dir="ltr">{l.original}</td><td dir="ltr">{l.debitAedCents !== "0" ? aed(l.debitAedCents) : ""}</td><td dir="ltr">{l.creditAedCents !== "0" ? aed(l.creditAedCents) : ""}</td><td dir="ltr">{aed(bal.toString())}</td><td>{l.approvedBy}</td></tr>; })}
        <tr className="print-total"><td /><td /><td>{t("st2.closing")}</td><td /><td /><td /><td dir="ltr">{aed(s.chargesAedCents)}</td><td dir="ltr">{aed(s.creditsAedCents)}</td><td dir="ltr">{aed(s.closingAedCents)}</td><td /></tr>
      </tbody>
    </table>
    <div className="print-split">
      {([["st2.byBeneficiary", s.byBeneficiary, "subs.beneficiary"], ["st2.byCompany", s.byCompany, "bills.company"]] as const).map(([title, g, col]) =>
        <section key={title}><h2>{t(title)}</h2><table className="print-table"><thead><tr><th>{t(col)}</th><th>{t("st2.count")}</th><th>{t("st2.total")}</th></tr></thead>
          <tbody>{g.map(x => <tr key={x.name}><td>{x.name}</td><td>{x.count}</td><td dir="ltr">{aed(x.aedCents)}</td></tr>)}</tbody></table></section>)}
    </div>
  </div>;
}
