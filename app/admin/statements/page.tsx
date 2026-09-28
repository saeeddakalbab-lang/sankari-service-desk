import { ProtectedPage } from "@/components/ProtectedPage";
import { StatementView } from "@/components/StatementView";
import { buildStatement, getAccounting, monthRe, prevMonth } from "@/lib/statements";
import { getViewer } from "@/lib/view";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
// Defaults to last month, the one accounting receives on the 1st.
export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [{ user, t }, q] = await Promise.all([getViewer(), searchParams]);
  if (!user || !(user.roles.includes("admin") || user.roles.includes("accountant"))) return <ProtectedPage roles={["admin", "accountant"]}><></></ProtectedPage>;
  const now = new Date(), thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`, acc = await getAccounting();
  let month = q.month && monthRe.test(q.month) ? q.month : prevMonth(thisMonth);
  if (month < acc.openingMonth) month = acc.openingMonth;
  const [s, people] = await Promise.all([buildStatement(month), query<{ name: string }>(`SELECT name FROM users WHERE disabled_at IS NULL AND name <> '' ORDER BY name`).then(r => r.rows.map(x => x.name))]);
  return <ProtectedPage roles={["admin", "accountant"]}>
    <div className="stack">
      <div className="stack-s"><h1>{t("st2.title")}</h1><p className="soft">{t("st2.lead")}</p></div>
      <form method="get" className="row no-print" style={{ alignItems: "end" }}>
        <div className="field"><label className="label" htmlFor="m">{t("st2.month")}</label><input className="input mono" id="m" name="month" type="month" min={acc.openingMonth} defaultValue={month} /></div>
        <button type="submit" className="btn btn-outline">{t("st2.show")}</button>
      </form>
      <StatementView s={JSON.parse(JSON.stringify(s))} admin={user.roles.includes("admin")} today={now.toISOString().slice(0, 10)} people={people} />
    </div>
  </ProtectedPage>;
}
