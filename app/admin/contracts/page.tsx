import Link from "next/link";
import { ProtectedPage } from "@/components/ProtectedPage";
import { listContracts, usd } from "@/lib/contracts";
import type { I18nKey } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { getViewer } from "@/lib/view";

export const dynamic = "force-dynamic";
const tone: Record<string, string> = { submitted: "gold", under_review: "gold", approved: "info", contract_sent: "info", signed: "info", active: "good", completed: "neutral", rejected: "bad", cancelled: "neutral" };
export default async function ContractsPage() {
  const { user, t } = await getViewer();
  if (!user || !(user.roles.includes("admin") || user.roles.includes("accountant"))) return <ProtectedPage roles={["admin", "accountant"]}><></></ProtectedPage>;
  const rows = await listContracts();
  return <ProtectedPage roles={["admin", "accountant"]}>
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
        <div className="stack-s"><h1>{t("ct.title")}</h1><p className="soft">{t("ct.lead")}</p></div>
        <a className="btn btn-outline" href="/contract-request" target="_blank" rel="noreferrer">{t("ct.publicLink")}</a>
      </div>
      <section className="card" aria-labelledby="ct-h">
        <div className="card-head"><h2 id="ct-h">{t("ct.title")}</h2><span className="soft mono">{rows.length}</span></div>
        {rows.length ? <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">{t("ct.ref")}</th><th scope="col">{t("ct.company")}</th><th scope="col">{t("ct.total")}</th><th scope="col">{t("ct.received")}</th><th scope="col">{t("ct.submitted")}</th><th scope="col">{t("ct.status")}</th></tr></thead>
          <tbody>{rows.map(c => <tr key={c.id}>
            <td><Link className="ref" href={`/admin/contracts/${c.id}`} dir="ltr">{c.reference}</Link></td>
            <td><strong style={{ fontWeight: 600 }}>{c.company_name}</strong><br /><span className="soft" style={{ fontSize: 13 }}>{c.contact_name}</span></td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{usd(c.total_cents)}<br /><span className="soft" style={{ fontSize: 12 }}>{c.duration_months} × {t("cycle.monthly")}</span></td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{usd(c.paid_cents)}</td>
            <td className="mono" dir="ltr" style={{ whiteSpace: "nowrap" }}>{fmtDate(c.created_at)}</td>
            <td><span className={`pill ${tone[c.status] ?? "neutral"}`}>{t(`ct.st.${c.status}` as I18nKey)}</span></td>
          </tr>)}</tbody>
        </table></div> : <p className="card-pad soft">{t("ct.none")}</p>}
      </section>
    </div>
  </ProtectedPage>;
}
