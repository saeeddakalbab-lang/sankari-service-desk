import Link from "next/link";
import { ProtectedPage } from "@/components/ProtectedPage";
import { formatMoney } from "@/lib/money";
import { billFilterSchema, listBills } from "@/lib/subscriptions";
import type { I18nKey } from "@/lib/i18n";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
// Server-rendered: the filter is a plain GET form, and the CSV link carries the same filters.
export default async function BillsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [{ user, t }, raw] = await Promise.all([getViewer(), searchParams]);
  if (!user || !(user.roles.includes("admin") || user.roles.includes("accountant"))) return <ProtectedPage roles={["admin", "accountant"]}><></></ProtectedPage>;
  const parsed = billFilterSchema.safeParse(raw), f = parsed.success ? parsed.data : { company: "", from: "", to: "" };
  const { rows, companies, totalAedCents } = await listBills(user, f);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return <ProtectedPage roles={["admin", "accountant"]}>
    <div className="stack">
      <div className="stack-s"><h1>{t("bills.title")}</h1><p className="soft">{t("bills.lead")}</p></div>
      <form method="get" className="card card-pad" aria-label={t("bills.title")}>
        <div className="grid-4" style={{ alignItems: "end" }}>
          <div className="field"><label className="label" htmlFor="b-company">{t("bills.company")}</label><select className="select" id="b-company" name="company" defaultValue={f.company}><option value="">{t("bills.all")}</option>{companies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="b-from">{t("bills.from")}</label><input className="input mono" id="b-from" name="from" type="date" defaultValue={f.from} /></div>
          <div className="field"><label className="label" htmlFor="b-to">{t("bills.to")}</label><input className="input mono" id="b-to" name="to" type="date" defaultValue={f.to} /></div>
          <div className="row"><button type="submit" className="btn btn-outline">{t("bills.apply")}</button><a className="btn btn-primary" href={`/api/bills/csv${qs ? `?${qs}` : ""}`} download>{t("bills.csv")}</a></div>
        </div>
      </form>
      <section className="card" aria-labelledby="bills-h">
        <div className="card-head"><h2 id="bills-h">{t("bills.title")}</h2><span className="soft mono" style={{ fontSize: 14 }}>{t("bills.total", { amount: formatMoney(totalAedCents, "AED"), n: rows.length })}</span></div>
        {rows.length ? <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">{t("bills.date")}</th><th scope="col">{t("subs.tool")}</th><th scope="col">{t("subs.beneficiary")}</th><th scope="col">{t("bills.company")}</th><th scope="col">{t("bills.amount")}</th><th scope="col">{t("bills.aed")}</th><th scope="col">{t("subs.card")}</th><th scope="col">{t("bills.approvedBy")}</th><th scope="col">{t("bills.request")}</th></tr></thead>
          <tbody>{rows.map(b => <tr key={b.id}>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{b.billed_on}</td>
            <td><strong style={{ fontWeight: 600 }}>{b.tool}</strong><br /><span className="soft" style={{ fontSize: 13 }}>{t(`bills.kind.${b.kind}` as I18nKey)}</span></td>
            <td>{b.beneficiary || "—"}</td>
            <td>{b.company_name || "—"}</td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{formatMoney(b.amount_cents, b.currency)}</td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{formatMoney(b.amount_aed_cents, "AED")}<br /><span className="soft" style={{ fontSize: 12 }}>{t("bills.rate")} {b.currency === "AED" ? "1" : b.usd_to_aed_rate.replace(/0+$/, "").replace(/\.$/, "")}</span></td>
            <td className="mono" dir="ltr">{b.card_last4 ? `•••• ${b.card_last4}` : "—"}</td>
            <td>{b.approved_by || "—"}</td>
            <td style={{ whiteSpace: "nowrap" }}>{b.request_id ? <Link className="ref" href={`/requests/${b.request_id}`} dir="ltr">{b.request_ref}</Link> : "—"}</td>
          </tr>)}</tbody>
        </table></div> : <p className="card-pad soft">{t("bills.none")}</p>}
      </section>
    </div>
  </ProtectedPage>;
}
